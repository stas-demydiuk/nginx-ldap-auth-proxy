# LDAP Auth proxy for nginx

With this script it is possible to make auth for nginx host via LDAP server.

Implemented using NodeJs according to https://github.com/nginxinc/nginx-ldap-auth solution.
LDAP deamon uses cookie to store encrypted auth data.

## Docker way

docker-compose.yml

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

Sample nginx host configuration
conf/sample-host.conf

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
    proxy_pass http://ldap-auth-proxy:8888;
  }
	
  location /auth-proxy {
    internal;
	
    proxy_pass http://ldap-auth-proxy:8888;
    proxy_cache auth_cache; # Must match the name in the proxy_cache_path directive above
    proxy_cache_valid 200 10m;

    # URL and port for connecting to the LDAP server
    proxy_set_header X-Ldap-URL "ldap://ldap-server:389";

    # Base DN
    proxy_set_header X-Ldap-BaseDN "ou=users,dc=example,dc=com";

    # Bind DN
    proxy_set_header X-Ldap-BindDN "cn=admin,dc=example,dc=com";

    # Bind password
    proxy_set_header X-Ldap-BindPass "ldapAdminPassword";
    
    # Ldap search template
    proxy_set_header X-Ldap-Template "(uid={{username}})";
  }
}
```
