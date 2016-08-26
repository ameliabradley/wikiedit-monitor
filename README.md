# wikiedit-monitor

[![Build Status](https://travis-ci.org/leebradley/wikiedit-monitor.svg?branch=master)](https://travis-ci.org/leebradley/wikiedit-monitor)

**wikiedit-monitor** logs Wikipedia activity live to a database and performs analysis on that data.

Project goals:
* Obtaining a proper diff of administrative revision deletes
* Detecting edit wars, as they happen
* Finding anomalies in Wikipedia data

This software should be able to run for weeks on end without problems.

## Setup
Prerequisites:
* [Docker Compose](https://docs.docker.com/compose/install/)

1. Copy `(project-root)/conf/docker-config.json.dist` to `(project-root)/config.json`.
2. Start the application by running `docker-compose up` in the project root.
3. Access the web interface at `http://localhost:8081`.

Any files you change in the project will sync to the Node Docker instance under `/app`.

Show output from the server processes:
```
docker-compose logs -f
```

Stop, start, or restart the server:
```
docker-compose stop
docker-compose start
docker-compose restart
```

Remove the docker container: `docker-compose down`

## Contributing
This project is primarily developed with [Node.js](https://nodejs.org/en/).

Make sure your changes succeed the unit tests by running `npm test` from the base directory.
