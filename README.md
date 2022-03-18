# shortener
Python based URL shortener using Flask, written in an afternoon.

# Setup
You'll want to clone the repo into a folder, doesn't really matter where.  
`git clone https://github.com/mja00/shortener/`  

Once cloned you just need to start up the containers with `docker-compose -f docker-compose.prod.yml up -d --build`. This will build and deploy the containers.
Since this uses a DB migration system we'll need to setup the DB with all needed tables, run `docker-compose -f docker-compose.prod.yml exec web flask db upgrade`.

You now have a running instance. Port 5000 is exposted onlt to the local host and not accessible over the internet. You'll need some form of reverse proxy or change the exposed ports.

Once on the site you'll need to register an account at the `/register` path. Create an account and login, you're all ready to create links.
I highly recommend putting the `/register` and `/login` paths behind some form of firewall. This'll ensure only you can create an account and login.
There's no protection from other logged in users from editing each other's links since I mostly wrote this for myself. 

If you ever need to access the DB you can do so through `docker-compose -f docker-compose.prod.yml exec db psql --username=shortener --db=shortener_prod`, replacing any info
if you changed it in the env files.

# Development
Clone the repo and cd in. Then you want to run `docker-compose up -d --build` this'll build and start the containers needed and bind to port 5000. Like above
run `docker-compose exec web flask db upgrade` to setup the development DB. Enjoy!

# Contributing
Feel free to make PRs or open issues. I don't know how much I'll be adding things, kinda wrote this for myself and felt like opening it up. 
