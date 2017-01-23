FROM node:alpine

MAINTAINER Stanislav Demydiuk <s.demydiuk@gmail.com>

# Auth cookie name and crypt password
ENV COOKIE_NAME LDAP_AUTH
ENV COOKIE_SECRET 1xEEgQamX25IhpZ04f2h

# Copy sources
RUN mkdir /nginx-ldap-proxy
ADD package.json /nginx-ldap-proxy/package.json
ADD form.html /nginx-ldap-proxy/form.html
ADD index.js /nginx-ldap-proxy/index.js

RUN cd /nginx-ldap-proxy && npm install

EXPOSE 8888
WORKDIR /nginx-ldap-proxy

CMD ["npm", "start"]