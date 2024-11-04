# Use the Node.js LTS version
FROM node:18-alpine

# Set the working directory inside the container
WORKDIR /app

# Copy package.json and pnpm-lock.yaml to install dependencies
COPY package.json pnpm-lock.yaml ./

# Install pnpm and dependencies
RUN npm install -g pnpm && pnpm install

# Copy the rest of the application code
COPY . .

# Compile TypeScript code
RUN pnpm build

# Expose the application port
EXPOSE 5000

# Start the application
CMD ["pnpm", "dev"]
