'use strict';

const
    http = require('http'),
    fs = require('fs'),
    qs = require('querystring'),
    crypto = require('crypto'),
    Cookies = require('cookies'),
    LdapAuth = require('ldapauth-fork');

const
    PORT = 8888,
    ALGORITHM = 'aes-256-ctr',
    COOKIE_NAME = process.env.COOKIE_NAME || 'LDAP_AUTH',
    COOKIE_SECRET = process.env.COOKIE_SECRET || '1xEEgQamX25IhpZ04f2h';

let form = fs.readFileSync('form.html'),
    ldapInstances = new Map();

let server = http.createServer(requestHandler);

server.listen(PORT);
console.log('Server is listening');

function requestHandler(request, response) {
    let cookies = new Cookies(request, response);

    if (request.method === 'GET' && request.url === '/auth-proxy') {
        checkAuthData(request, response, cookies);
    }

    if (request.method === 'GET' && request.url === '/login') {
        if (request.headers['content-type'] === 'application/x-www-form-urlencoded' && !cookies.get(COOKIE_NAME)) {
            saveAuthData(request, response, cookies);
        } else {
            showAuthForm(response, cookies);
        }
    }
}

function checkAuthData(request, response, cookies) {
    return auth(request, cookies)
        .then(() => {
            response.writeHead(200);
            response.end();
        })
        .catch((error) => {
            response.writeHead(401);
            response.end();
        });
}

function saveAuthData(request, response, cookies) {
    return getFormData(request)
        .then((data) => {
            let authData = encrypt([data.username, data.password].join(':'));

            cookies.set(COOKIE_NAME, authData, {
                httpOnly: true
            });

            response.writeHead(200);
            response.end('<script>window.location.reload()</script>');
        })
        .catch((error) => {
            response.writeHead(500, {'Content-Type': 'application/json'});
            response.end(JSON.stringify(error));
        });
}

function showAuthForm(response, cookies) {
    cookies.set(COOKIE_NAME, 'deleted', {
        expires: new Date(0),
        httpOnly: true
    });

    response.writeHead(200, {
        'Content-Type': 'text/html'
    });

    response.end(form);
}

function getFormData(request) {
    return new Promise((resolve, reject) => {
        let body = '';

        request.on('data', (data) => {
            body += data;

            // Too much POST data, kill the connection!
            // 1e6 === 1 * Math.pow(10, 6) === 1 * 1000000 ~~~ 1MB
            if (body.length > 1e6) {
                request.connection.destroy();
                reject();
            }
        });

        request.on('end', () => {
            resolve(qs.parse(body));
        });
    });
}

function getLdapInstance(request) {
    let config = {
        url: request.headers['x-ldap-url'],
        bindDn: request.headers['x-ldap-binddn'],
        bindCredentials: request.headers['x-ldap-bindpass'],
        searchBase: request.headers['x-ldap-basedn'],
        searchFilter: request.headers['x-ldap-template'] || '(uid={{username}})',
        reconnect: true
    };

    let key = JSON.stringify(config);

    if (!ldapInstances.has(key)) {
        ldapInstances.set(key, new LdapAuth(config));
    }

    return ldapInstances.get(key);
}

function auth(request, cookies) {
    let ldapInstance = getLdapInstance(request);

    return new Promise((resolve, reject) => {
        if (!cookies.get(COOKIE_NAME)) {
            reject(401);
        }

        let data = decrypt(cookies.get(COOKIE_NAME)).split(':'),
            username = data[0],
            password = data[1];

        ldapInstance.authenticate(username, password, (err, user) => {
            err ? reject(err) : resolve(user);
        });
    });
}

function encrypt(text) {
    let cipher = crypto.createCipher(ALGORITHM, COOKIE_SECRET),
        crypted = cipher.update(text, 'utf8', 'hex');

    crypted += cipher.final('hex');
    return crypted;
}

function decrypt(text) {
    let decipher = crypto.createDecipher(ALGORITHM, COOKIE_SECRET),
        dec = decipher.update(text, 'hex', 'utf8');

    dec += decipher.final('utf8');
    return dec;
}