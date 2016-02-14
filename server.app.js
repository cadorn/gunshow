
const PATH = require("path");
const EXPRESS = require('express');
const GUN = require('../gunfield/node_modules/gun');
const BROWSERIFY = require("browserify");
const RIOTIFY = require("riotify");
const BODY_PARSER = require('body-parser');
const POUCHFIELD = require("../pouchfield/server.app");

const DATA = require("./lib/data");


exports.app = function (options) {

    if (!options.s3.secret) {
        throw new Error("Missing secret config credentials! Load them into your environment first.");
    }

    var gun = GUN({
    //	file: 'data.json',
    	s3: {
    	    prefix: "2016-02-gunfield",
    	    prenode: "/nodes/",
    		key: options.s3.key,
    		secret: options.s3.secret,
    		bucket: options.s3.bucket,
    		region: options.s3.region
    	},
    	ws: options.ws || {}
    });

    var cloudinary = require('cloudinary');
    cloudinary.config({ 
        cloud_name: options.cloudinary.cloud_name,
        api_key: options.cloudinary.api_key,
        api_secret: options.cloudinary.api_secret
    });


/*
    function syncLibrary (config) {

        console.log("Trigger library sync");

        if (!syncLibrary._dataInstance) {
            var data = DATA.forSpine({
                GUN: require('../gunfield/node_modules/gun/gun.js'),
                UTIL: require("./lib/util"),
                RIOT: require("riot"),
                LODASH: require("lodash"),
                Promise: require("bluebird"),
                config: config
            });
            syncLibrary._dataInstance = data.data;

            var cloudinary = require('cloudinary');
            cloudinary.config({ 
                cloud_name: options.cloudinary.cloud_name,
                api_key: options.cloudinary.api_key,
                api_secret: options.cloudinary.api_secret
            });
            syncLibrary._cloudinaryInstance = cloudinary;
            
            var syncing = false;
            
            syncLibrary._sync = function () {
                
                if (syncing) return;
                syncing = true;

                var ns = "library/images/all";
                var data = syncLibrary._dataInstance;
                var cloudinary = syncLibrary._cloudinaryInstance;

        }
        return syncLibrary._sync();
    }
*/

    var app = EXPRESS();


    app.use('/pouchfield', POUCHFIELD.app(options.pouchfield));

    var jsonParser = BODY_PARSER.json();
    app.post('/cloudinary.js', jsonParser, function (req, res, next) {

//        syncLibrary(req.body.config);

        res.setHeader('Content-Type', 'application/json');

        if (req.body.action === "list") {
            return cloudinary.api.resources(function (result) {

                result.resources.forEach(function (resource) {
                    if (resource.resource_type === "image") {
                        resource.public_urls = {
                            thumbnail: cloudinary.url(resource.public_id, {
                                width: 200,
                                height: 200,
                                crop: "fill"
                            })
                        };
                    }
                });
                return res.end(JSON.stringify(result, null, 4));
            }, {
                type: "upload",
                tags: true,
                context: true,
                direction: "desc",
                max_results: 250,
                next_cursor: req.body.cursor || null,
                prefix: (
                    options.cloudinary.import &&
                    options.cloudinary.import.folder &&
                    (options.cloudinary.import.folder + "/")
                ) || ""
            });
        }
        return res.end(JSON.stringify({}, null, 4));
    });


    // TODO: Move these into gunshow lib/plugins.
    app.get('/app.js', function (req, res, next) {
		var browserify = BROWSERIFY({
			basedir: __dirname,
			entries: [
			    'client.app.js'
		    ]
		});
		browserify.transform(RIOTIFY, {});
		return browserify.bundle(function (err, data) {
			if (err) return next(err);
            res.writeHead(200, {
                "Content-type": "application/javascript"
            });
			return res.end(data.toString());
		});
	});



console.log("options.postgres.url", options.postgres.url);
    
    const KNEX = require("knex");
	var knexConnection = KNEX({
	    client: 'pg',
        connection: options.postgres.url + "?ssl=true&sslfactory=org.postgresql.ssl.NonValidatingFactory"
	});
    var knex = function (tableName, query) {
		if (typeof query === "undefined" && typeof tableName === "function") {
			query = tableName;
			tableName = null;
		}
		var table = knexConnection(tableName);
		return query(table).then(function (resp) {

//console.log("RESPONSE:", resp);

			return resp;
		}).catch(function (err) {
			console.error("DB Error:", err.stack);
			throw err;
		});
	}	

    app.post('/data', jsonParser, function (req, res, next) {

        console.log("call data api", req.body);

        function ensureTable (tableName) {
            return knexConnection.schema.hasTable(tableName).then(function(exists) {
                if (exists) return null;
                return knexConnection.schema.createTable(tableName, function (table) {
                    table.string('id').primary();
                    table.text("data");
                });
            });
        }

        return ensureTable(req.body.table).then(function () {

            res.setHeader('Content-Type', 'application/json');
            
            function respond (data) {
                return res.end(JSON.stringify(data, null, 4));
            }

            if (req.body.method === "all") {
                return knex(req.body.table, function (table) {
                    return table.select("*");
                }).then(function (result) {
                    var records = {};
                    result.forEach(function (record) {
                        records[record.id] = JSON.parse(record.data);
                        records[record.id].id = record.id;
                    });
                    return respond(records);
                });
            } else
            if (req.body.method === "create") {
                return knex(req.body.table, function (table) {
                    var data = {
                        id: req.body.id,
                        data: JSON.stringify(req.body.data)
                    };
                    return table.returning('id').insert(data);
                }).then(function (result) {
                    return respond(result);
                });
            } else
            if (req.body.method === "update") {
                return knex(req.body.table, function (table) {
                    return table.update({
                        data: JSON.stringify(req.body.data)
                    }).where({
                        id: req.body.id
                    });
                }).then(function (result) {
                    return respond(result);
                });
            } else
            if (req.body.method === "get") {
                return knex(req.body.table, function (table) {
                    return table.where({
                        id: req.body.id
                    });
                }).then(function (result) {
                    var record = result.shift();
                    var data = JSON.parse(record.data);
                    data.id = record.id;
                    return respond(data);
                });
            } else
            if (req.body.method === "has") {
                return knex(req.body.table, function (table) {
                    return table.where({
                        'id': req.body.id
                    });
                }).then(function (result) {
                    if (result.length === 1) {
                        return respond(true);
                    }
                    return respond(false);
                });
            } else {
console.log("method not found req.body", req.body);
            }
            return respond({});
        });
    });



    app.use('/magnific-popup', EXPRESS.static(PATH.join(require.resolve("magnific-popup/package.json"), "../dist")));
    app.use('/codemirror', EXPRESS.static(PATH.join(require.resolve("codemirror/package.json"), "../lib")));


    app.use(function (req, res, next) {
    	if(gun.wsp.server(req, res)) {
    		return; // filters gun requests!
    	}
    	return next();
    });



    function ensureServer (req) {
        if (ensureServer._ensured) return;
if (req) console.log("options.gun.server 0", req._server);
        if (
            req &&
            req._server
        ) {
            gun.wsp(req._server);
            ensureServer._ensured = true;
            return;
        }
        if (
            !options.gun ||
            !options.gun.server
        ) {
            return;
        }
console.log("options.gun.server 1", options.gun.server);
        if (
            typeof options.gun.server.use === "function"
        ) {
            gun.wsp(options.gun.server);
            ensureServer._ensured = true;
            return;
        }
        var server = options.gun.server();
console.log("options.gun.server 2", server);
        if (server) {
            gun.wsp(server);
            ensureServer._ensured = true;
        }
    }
    
    ensureServer();

    return function (req, res, next) {

        if (options.match) {
            var params = req.params;
            // TODO: Relocate into generic helper.
            var expression = new RegExp(options.match.replace(/\//g, "\\/"));
            var m = expression.exec(req.params[0]);
            if (!m) return next();
            params = m.slice(1);
            req.url = params[0];
        }

        ensureServer(req);

        return app(req, res, function (err) {
            if (err) {
                console.error(err.stack || err);
                // TODO: Send simple error message to client.
                return next(err);
            }
            return next();
        });
    };
}
