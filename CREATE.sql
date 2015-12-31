DROP TABLE IF EXISTS errorlog;
CREATE TABLE errorlog (
   revnew integer,
   type varchar,
   data text,
   url varchar,
   created timestamp DEFAULT current_timestamp
);

DROP TABLE IF EXISTS wikiedits;
CREATE TABLE wikiedits (
   wiki varchar,
   revnew integer,
   revold integer,
   title varchar,
   comment varchar,
   diff text,
   username varchar,
   created timestamp DEFAULT current_timestamp,
   updated timestamp,
   PRIMARY KEY (wiki, revnew)
);

/* PK */
CREATE INDEX index_title ON wikiedits (wiki, title);
CREATE INDEX index_username ON wikiedits (wiki, username);
