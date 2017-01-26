# LDAP Auth proxy for nginx

With this script it is possible to make auth for nginx host via LDAP server.

```
| --------- |    auth   | ----------------- |
|   Nginx   |  <----->  |  LDAP Auth proxy  |
| --------- |           | ----------------- |
      ˄
      |
      ˅    
| --------- |
|  Backend  |
| --------- |
```

Implemented using NodeJs according to https://github.com/nginxinc/nginx-ldap-auth solution.
LDAP deamon uses cookie to store encrypted auth data.

## Nginx config

You have to modify your nginx config to add auth request

before

```
proxy_cache_path cache/ keys_zone=auth_cache:10m;

server {
  listen 80 default;
  server_name example.com;

  location / {
    proxy_pass http://your-real-service.com/;
  }
}

```

after:

```
proxy_cache_path cache/ keys_zone=auth_cache:10m;

server {
  listen 80 default;
  server_name example.com;

  location / {
    auth_request /auth-proxy;

    # redirect 401 to login form
    error_page 401 =200 /login;

    proxy_pass http://your-real-service.com/;
  }
	
  location /login {
    add_header Cache-Control no-cache;
    proxy_pass http://ldap-auth-proxy:8888;
  }
	
  location /auth-proxy {
    internal;
	
    proxy_pass http://ldap-auth-proxy:8888;
    proxy_cache auth_cache; # Must match the name in the proxy_cache_path directive above
    proxy_cache_valid 200 10m;

    # LDAP server
    proxy_set_header X-Ldap-URL "ldap://ldap-server:389";
    proxy_set_header X-Ldap-BindDN "cn=admin,dc=example,dc=com";
    proxy_set_header X-Ldap-BindPass "ldapAdminPassword";

    # User DN
    proxy_set_header X-Ldap-BaseDN "ou=users,dc=example,dc=com";

    # Filter By Group (replace TargetGroupName with required group name)
    # proxy_set_header X-Ldap-Group-BaseDN "ou=group,dc=example,dc=com";
    # proxy_set_header X-Ldap-Group-Template "&(memberUid={{dn}})(cn=TargetGroupName)";
    # proxy_set_header X-Ldap-Group-DNProperty "uid";
  }
}
```

## LDAP Auth Proxy server

See index.js for server implementation. To start
```
npm start
```

You also can start LDAP proxy using docker container. Here the example of docker-compose.yml with nginx and proxy containers:

```
version: '2'
services:
  nginx:
    image: nginx
    container_name: nginx-proxy
    ports:
      - '80:80'
      - '443:443'
    volumes:
      - './conf:/etc/nginx/conf.d:ro'
    links:
      - ldap-auth-proxy
    restart: "always"
  ldap-auth-proxy:
    image: stasdemydiuk/nginx-ldap-auth-proxy
    environment:
      - COOKIE_SECRET=YourSecretKey
    restart: "always"
```


