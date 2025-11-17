FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install -g pm2 && npm install --production

COPY . .

EXPOSE 5001
EXPOSE 5002

#Run service using pm2
CMD ["pm2-runtime", "start", "process.json", "--env", "production"]