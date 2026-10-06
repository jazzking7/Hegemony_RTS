FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* tsconfig.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/index.html /app/online.html /app/styles.css /app/online.css ./
COPY --from=build /app/js ./js
COPY --from=build /app/shared ./shared
EXPOSE 2567
CMD ["npm", "start"]
