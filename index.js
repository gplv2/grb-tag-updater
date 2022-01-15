#!/usr/bin/env node

// libraries

const path = require("path");
const fs = require("fs");
const util = require('util');

var Client = require('pg-native');

// without sslmode=disable it core dumps with a segfault
var db_url = 'postgres://grb-data:str0ngDBp4ssw0rd@localhost:5434/grb_api?sslmode=disable';

console.log("Connecting to database ... ");

var client = new Client();

var cn = client.connectSync(db_url);

if (cn) {
    console.log('Connected to database');
}

var GeoJSON = require('geojson');
var xml2js = require('xml2js');
var parser = new xml2js.Parser();

var stats = [ ];

// config
const fileNamePath = path.join(__dirname, "./data/weerde.osm");
//const fileNamePath = path.join(__dirname, "./data/osm_version_ref.xml");

console.log("Loading OSM data ... ");
fs.readFile(fileNamePath, function (err, data) {
    if (err) throw err;
    parser.parseString(data, function (err, result) {
        if (err) throw err;
        //console.log(util.inspect(result, false, null));
        //
        //var charac = result.eveapi.result[0].rowset[0].row[0].$.characterID;
        //console.log(result.osm.way);
        //console.log(util.inspect(result.osm, false, null));

        var node_refs = { };

        // Build a nodes lat/lon map
        result.osm.node.forEach((element) => {
            //console.log(element);
            if (element.$.lat && element.$.lon) {
                //console.log(element.$.id);
                node_refs[element.$.id] = Array(element.$.lon, element.$.lat);
            }
        });
        //console.log(node_refs);
            //process.exit();

        var geo_buildings = { };

        stats['has_source_ref']=0;
        stats['has_version_ref']=0;
        stats['building_count']=0;

        result.osm.way.forEach((element) => {
            // console.log("Start");
            console.log("osm id : " + element.$.id); 
            if (element.tag) {
                //console.log("length : " + element.tag.length);
                // Scan for building tag
                var is_building = 0;
                var is_sourced_building = 0;
                element.tag.forEach((key) => {
                    //console.log(key);
                    if (key.$.k == 'building') {
                        stats['building_count']++;
                        is_building++;
                        //console.log(key.$.k);
                    }
                    if (key.$.k == 'source:geometry:ref') {
                        stats['has_source_ref']++;
                        is_sourced_building++;
                        //console.log(key.$.k);
                    }
                    if (key.$.k == 'source:geometry:date' || key.$.k == 'source:geometry:version') {
                        stats['has_version_ref']++;
                        is_sourced_building++;
                        //console.log(key.$.k);
                    }
                });
                if (is_building && is_sourced_building !== 2 ) {
                    console.log("Found building : " + element.$.id);
                    //console.log("source_tags : " + is_sourced_building);
                    // we found a building without source tags.
                    coordinates = new Array();
                    element.nd.forEach((key) => {
                        //console.log(node_refs[key.$.ref]);
                        coordinates.push(node_refs[key.$.ref]);
                    });
                    //console.log(coordinates);

                    geo_buildings[element.$.id] = coordinates;
                }
                //process.exit();
            } 
        });

        /*
        Object.keys(geo_buildings).forEach(prop => {
            console.log(geo_buildings[prop]);
        });
        */

        var polys = [ ];

        // console.log(util.inspect(geo_buildings, false, null));
        
        // Build geojson
        Object.keys(geo_buildings).forEach( (key, value) => {
            //console.log(value);
            var gdata = [ {
                polygon: [ geo_buildings[key] ],
                id: {"ref": key }
                } ];
            var gjson = GeoJSON.parse(gdata, {'Polygon': 'polygon' , removeInvalidGeometries: true });

            polys.push(gjson);
            // console.log(util.inspect(gjson, false, null));
        });

        //console.log(polys);
        //console.log(util.inspect(polys, false, null));
        //process.exit();
        

        // Checking database

        //const query = "SELECT pb.osm_id as osm_id ,po.osm_id internal_id,ST_HausdorffDistance(po.way,pb.way) as hausdorf FROM planet_osm_polygon po JOIN planet_building_polygon pb ON ST_Overlaps(po.way,pb.way) WHERE pb.osm_id=$1 ORDER BY 3 ASC LIMIT 1";
        ////  ST_Transform(ST_SetSRID(ST_Point(-123.365556, 48.428611),4326),3785)
        const query = "SELECT po.osm_id as osm_id ,ST_HausdorffDistance(po.way,ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($1),4326),900913)) as hausdorf FROM planet_osm_polygon po WHERE ST_Overlaps(po.way,ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($1),4326),900913)) ORDER BY 2 ASC LIMIT 1";

        stats['matches']=0;
        stats['misses']=0;

        polys.forEach((poly) => {
            //console.log(util.inspect(poly, false, null));
            //console.log(poly.features[0].properties.id['ref']);
            var osm_id=poly.features[0].properties.id['ref'];
            var geometry=JSON.stringify(poly.features[0].geometry);
            /*
            if (osm_id == 618618530 ) {
                console.log(query);
                console.log(geometry);
                process.exit();
            }    
            */
            var params = new Array( geometry );
            console.log("Checking osm id: " + osm_id);
            //process.exit();
            var rows = client.querySync(query,params);
            if (rows.length === 0 ) {
                console.log("No matching building found");
                return;
            }

            rows.forEach(row => {
                console.log(`Id: ${row.osm_id} Internal ID: ${row.internal_id} Hausdorf: ${row.hausdorf}`);

                if (row.hausdorf < 0.9 ) {
                    stats['matches']++;
                } else {
                    stats['misses']++;
                }
            })
        });

        console.log(stats);

        // Checking database for Polys
        /*
        polys.forEach((poly) => {
            console.log(util.inspect(poly, false, null));
        });
        */


        // process.exit();
        var builder = new xml2js.Builder();
        var xml = builder.buildObject(result);
        //console.log(xml);

        //console.log(JSON.stringify(result, null, 4));
        //console.dir(result);
        console.log('Done');
    });
});
