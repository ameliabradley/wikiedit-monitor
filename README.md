# wikiedit-monitor

**wikiedit-monitor** logs Wikipedia activity live to a database and performs analysis on that data.

Project goals:
* Obtaining a proper diff of administrative revision deletes
* Detecting edit wars, as they happen
* Finding anomalies in Wikipedia data

This software should be able to run for weeks on end without problems.

## Setup
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
* Point a browser at the given URL

**wikiedit-monitor** is very much a work in progress. It currently does very little other than logging data and detecting administrative revision deletes.
