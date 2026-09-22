FROM mcr.microsoft.com/playwright:v1.45.0-jammy

WORKDIR /e2e

COPY package.json .
RUN npm install --ignore-scripts

COPY . .

ENTRYPOINT ["npx", "playwright", "test"]
