# Use an official Node.js runtime as the base image
FROM node:16

# Set the working directory in the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json (if available)
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application code
COPY . .

# Expose the port the web panel runs on (adjust if necessary)
EXPOSE 3000

# Command to run both the bot and web panel
CMD ["npm", "run", "start"]