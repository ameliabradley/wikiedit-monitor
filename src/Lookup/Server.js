var http = require('http'),
  url = require('url'),
  fs = require('fs'),
  path = require('path'),
  jade = require('jade'),
  MongoClient = require('mongodb').MongoClient,
  express = require('express');

var servers = new WeakMap();
class LookupServer {
  constructor(config) {
    servers.set(this, {
      conString: config.conString,
      port: config.port,
      jadeTemplateDir: config.jadeTemplateDir,
      publicDir: config.publicDir
    });
  }
}

module.exports = LookupServer;
