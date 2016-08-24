# wikiedit-monitor

[![Build Status](https://travis-ci.org/leebradley/wikiedit-monitor.svg?branch=master)](https://travis-ci.org/leebradley/wikiedit-monitor)

**wikiedit-monitor** logs Wikipedia activity live to a database and performs analysis on that data.

Project goals:
* Obtaining a proper diff of administrative revision deletes
* Detecting edit wars, as they happen
* Finding anomalies in Wikipedia data

This software should be able to run for weeks on end without problems.

## Development Setup
Prerequisites:
* Docker
* Node.js

1. Copy `(project-root)/conf/docker-config.json` to `(project-root)/config.json`.
2. Start the MongoDB instance by running `npm mongo-docker`.
3. The monitor and web interface by running `npm node-docker-win` (Windows) or `npm node-docker-nix` (Linux and OS X).
4. Access the web interface at `http://localhost:8081`.

Any files you change in the project will sync to the Node Docker instance under `/app`.

Show output from the server processes:
```
docker attach wikiedit-monitor
```

Stop, start, or restart the server:
```
docker stop wikiedit-monitor
docker start wikiedit-monitor
docker restart wikiedit-monitor
```

Remove the docker container: `docker rm wikiedit-monitor`


## Manual Setup
wikiedit-monitor requires MongoDB, and over time, a substantial amount of hard drive space.

Steps:
* Set up MongoDB
* Clone the repository
* Copy `conf/config.json.example` to the base project directory and rename it to `config.json`
* Modify `config.json` to point to your MongoDB instance
* Install the required npm packages with `npm install`
* Run the initialization script with `nodejs init_mongodb.js`
* Start the logging utility with `nodejs editlog.js`

After you have some data, you should be able to analyize errors:
* Run `nodejs lookup.js`
* Point a browser at the given URL, adding a query parameter for desired function
  * diff
  * title
  * errorlog (ex: http://localhost:8081/?errorlog)

**wikiedit-monitor** is very much a work in progress. It currently does very little other than logging data and detecting administrative revision deletes.

## Contributing
Make sure your changes succeed the unit tests by running `npm test` from the base directory.
