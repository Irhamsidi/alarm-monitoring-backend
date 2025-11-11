FROM node:lts-alpine

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install
RUN npm install pm2 -g

COPY . .

EXPOSE 5001
EXPOSE 5002

#Run service using pm2
CMD ["pm2-runtime", "start", "process.json", "--env", "production"]