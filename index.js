'use strict';

const http = require('http'),
    fs = require('fs'),
    qs = require('querystring'),
    crypto = require('crypto'),
    LdapAuth = require('ldapauth-fork');

const
    ALGORITHM = 'aes-256-ctr',
    COOKIE_NAME = 'LDAP_AUTH';

let form = fs.readFileSync('form.html'),
    ldapInstances = new Map();

let server = http.createServer(function (request, response) {
    if (request.method === 'POST') {
        getFormData(request)
            .then((data) => {
                let authData = encrypt(
                    [data.username, data.password].join(':'),
                    request.headers['x-ldap-bindpass']
                );

                response.writeHead(302, {
                    'Set-Cookie': `${COOKIE_NAME}=${authData}; path=/; httponly`,
                    'Location': request.headers['x-target']
                });

                response.end();
            })
            .catch((error) => {
                response.writeHead(500, {'Content-Type': 'application/json'});
                response.end(JSON.stringify(error));
            });
    }

    if (request.method === 'GET' && request.url === '/auth-proxy') {
        auth(request)
            .then(() => {
                response.writeHead(200);
                response.end();
            })
            .catch((error) => {
                response.writeHead(401, {
                    'Content-Type': 'application/json',
                    'Set-Cookie': `${COOKIE_NAME}=deleted; expires=Thu, 01 Jan 1970 00:00:00 GMT; httponly`
                });
                response.end(JSON.stringify(error));
            });
    }

    if (request.method === 'GET' && request.url === '/login') {
        if (request.headers['content-type'] === 'application/x-www-form-urlencoded') {
            saveAuthData(request, response);
        } else {
            response.writeHead(200, {'Content-Type': 'text/html'});
            response.end(form);
        }
    }
});

server.listen(8888);
console.log('Server is listening');

function saveAuthData(request, response) {
    getFormData(request)
        .then((data) => {
            let authData = encrypt(
                [data.username, data.password].join(':'),
                request.headers['x-ldap-bindpass']
            );

            response.writeHead(200, {
                'Set-Cookie': `${COOKIE_NAME}=${authData}; path=/; httponly`,
            });

            response.write('<script>window.location.reload()</script>');
            response.end();
        })
        .catch((error) => {
            response.writeHead(500, {'Content-Type': 'application/json'});
            response.end(JSON.stringify(error));
        });
}

function getFormData(request) {
    return new Promise(function (resolve, reject) {
        let body = '';

        request.on('data', function (data) {
            body += data;

            // Too much POST data, kill the connection!
            // 1e6 === 1 * Math.pow(10, 6) === 1 * 1000000 ~~~ 1MB
            if (body.length > 1e6) {
                request.connection.destroy();
                reject();
            }
        });

        request.on('end', function () {
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

function auth(request) {
    let ldapInstance = getLdapInstance(request);

    return new Promise((resolve, reject) => {
        let cookies = parseCookies(request);

        if (!cookies['LDAP_AUTH']) {
            reject(401);
        }

        let data = decrypt(cookies[COOKIE_NAME], request.headers['x-ldap-bindpass']).split(':'),
            username = data[0],
            password = data[1];

        //resolve();

        ldapInstance.authenticate(username, password, function (err, user) {
            if (err) {
                reject(err);
            } else {
                resolve(user);
            }
        });
    });
}

function parseCookies(request) {
    let list = {},
        rc = request.headers.cookie;

    rc && rc.split(';').forEach(function (cookie) {
        let parts = cookie.split('=');

        list[parts.shift().trim()] = decodeURI(parts.join('='));
    });

    return list;
}

function encrypt(text, password) {
    let cipher = crypto.createCipher(ALGORITHM, password),
        crypted = cipher.update(text, 'utf8', 'hex');

    crypted += cipher.final('hex');
    return crypted;
}

function decrypt(text, password) {
    let decipher = crypto.createDecipher(ALGORITHM, password),
        dec = decipher.update(text, 'hex', 'utf8');

    dec += decipher.final('utf8');
    return dec;
}