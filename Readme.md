# Setup

## 1. Install node and npm
I personally recommend using nvm to install node

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
nvm install 20.12.2
```

## 2. Clone the repository
```bash
git clone https://github.com/f95bot/f95bot.git
```

## 3. Install dependencies
```bash
npm install
```

## 4. Install mysql
```bash
sudo apt-get install mysql-server
```

## 4. Edit .config-example.js
Update mysql credentials

## 5. Setup config file
Run setup script
```bash
npm run setup
```
## 6. Setup nginx and use config file in ./database/nginx.conf
```bash
sudo apt-get install nginx
```
## 7. Be sure to update discord credentials in .config.js
> botToken, clientId, clientSecret, callbackUrl, guildId, staffRoleId, ownerId, requiredRole, prefix, applicationId

## 8. Install and setup docker
Then run the following command to build the image and run the container
```bash
docker build -t f95bot .
docker run --network="host" -d -p 3000:3000 --name f95bot-container f95bot
```
