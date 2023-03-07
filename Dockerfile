FROM node:18.12.0-alpine3.15 AS frontend

WORKDIR /frontend

# install git
RUN apk add git

COPY package.json .
COPY ./package-lock.json .

# install frontend dependencies before copying the frontend code
# into the container so we get docker cache benefits
RUN npm install

# don't allow any dependencies with vulnerabilities
#RUN npx audit-ci --low

# running ngcc before build_prod lets us utilize the docker
# cache and significantly speeds up builds without requiring us
# to import/export the node_modules folder from the container
#RUN npm run ngcc

COPY tailwind.config.js .
COPY tsconfig.json .
COPY src ./src
COPY public ./public
COPY nginx.conf .

# use --build-arg environment=custom to specify a custom environment
ARG environment=production

COPY ./.env.$environment ./.env

RUN npm run build

# build minified version of frontend, served via nginx
FROM nginx:1.17

COPY --from=frontend frontend/build/ /usr/share/nginx/html
COPY --from=frontend frontend/nginx.conf /etc/nginx/conf.d/default.conf

# Expose port
EXPOSE 80
# Start nginx
CMD ["nginx", "-g", "daemon off;"]
