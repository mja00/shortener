# shortener
[![Docker Pulls](https://img.shields.io/docker/pulls/mja00/shortener)](https://hub.docker.com/r/mja00/shortener)
[![GitHub Workflow Status](https://img.shields.io/github/actions/workflow/status/mja00/shortener/docker-image.yml)](https://github.com/mja00/shortener/actions/workflows/docker-image.yml)

Python based URL shortener using Flask, written in an afternoon.

# Setup
You'll want to clone the repo into a folder, doesn't really matter where.  
`git clone https://github.com/mja00/shortener/`  

Once cloned you just need to start up the containers with `docker-compose -f docker-compose.prod.yml up -d --build`. This will build and deploy the containers.
Since this uses a DB migration system we'll need to setup the DB with all needed tables, run `docker-compose -f docker-compose.prod.yml exec web flask db upgrade`.

You now have a running instance. Port 5000 is exposted only to the local host and not accessible over the internet. You'll need some form of reverse proxy or change the exposed ports.

Once on the site you'll need to register an account at the `/register` path. Create an account and login, you're all ready to create links.
I highly recommend putting the `/register` and `/login` paths behind some form of firewall. This'll ensure only you can create an account and login.
There's no protection from other logged in users from editing each other's links since I mostly wrote this for myself. 

If you ever need to access the DB you can do so through `docker-compose -f docker-compose.prod.yml exec db psql --username=shortener --db=shortener_prod`, replacing any info
if you changed it in the env files.

# Development
Clone the repo and cd in. Then you want to run `docker-compose up -d --build` this'll build and start the containers needed and bind to port 5000. Like above
run `docker-compose exec web flask db upgrade` to setup the development DB. Enjoy!

# Environment variables
| Variable | Default | Description |
| --- | --- | --- |
| `DATABASE_URL` | None | The database connection string. See `SQLALCHEMY_DATABASE_URI` @ https://flask-sqlalchemy.palletsprojects.com/en/2.x/config/ |
| `DISABLE_REGISTRATION` | `False` | Disables the registration on the site |
| `SECRET_KEY` | `CHANGEME` | A secret key that will be used for securely signing the session cookie and can be used for any other security related needs |
| `ROOT_REDIRECT` | None | A page to re-direct the root url to. |
| `THEME` | `darkly` | A [Bootswatch](https://bootswatch.com/) theme name |

# Contributing
Feel free to make PRs or open issues. I don't know how much I'll be adding things, kinda wrote this for myself and felt like opening it up. 
