#!/usr/bin/env node

// libraries

const path = require("path");
const fs = require("fs");
const util = require('util');

var jp = require('jsonpath');
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
const fileNamePath = path.join(__dirname, "./data/export.osm");
//const fileNamePath = path.join(__dirname, "./data/osm_version_ref.xml");

console.log("Loading OSM data ... ");
fs.readFile(fileNamePath, function (err, data) {
    if (err) throw err;
    parser.parseString(data, function (err, result) {
        if (err) throw err;

        //console.log(util.inspect(result, false, null));
        //process.exit();

        var node_refs = { };
        var addresses = { };

        // Build a nodes lat/lon map for geojson object building
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
        stats['osm_has_street']=0;
        stats['osm_has_urbisref']=0;
        stats['osm_has_housenumber']=0;
        stats['osm_has_street_error']=0;
        stats['osm_has_number_error']=0;

        result.osm.way.forEach((element) => {
            // console.log("Start");
            console.log("osm id : " + element.$.id); 
            if (element.tag) {
                //console.log("length : " + element.tag.length);
                // Scan for building tag
                var is_building = 0;
                var is_sourced_building = 0;
                var addr = { };
                element.tag.forEach((key) => {
                    console.log(key);
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
                    if (key.$.k == 'addr:street') {
                        addr['street'] = key.$.v;
                        stats['osm_has_street']++;
                    }
                    if (key.$.k == 'ref:UrbIS') {
                        addr['urbis'] = key.$.v;
                        stats['osm_has_urbisref']++;
                    }
                    if (key.$.k == 'addr:housenumber') {
                        addr['number'] = key.$.v;
                        stats['osm_has_housenumber']++;
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
                    if (addr.street && addr.number && addr.urbis) {
                        addresses[element.$.id] = { 'street' : addr.street , 'number' : addr.number , 'urbis' : addr.urbis};
                    } else if (addr.street && addr.number) {
                        addresses[element.$.id] = { 'street' : addr.street , 'number' : addr.number };
                    }

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
        //console.log(addresses);
        //process.exit();
        
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
        

        // Checking database for matching geos
        //const query = "SELECT pb.osm_id as osm_id ,po.osm_id internal_id,ST_HausdorffDistance(po.way,pb.way) as hausdorf FROM planet_osm_polygon po JOIN planet_building_polygon pb ON ST_Overlaps(po.way,pb.way) WHERE pb.osm_id=$1 ORDER BY 3 ASC LIMIT 1";
        ////  ST_Transform(ST_SetSRID(ST_Point(-123.365556, 48.428611),4326),3785)
        const query = "SELECT po.osm_id as osm_id ,ST_HausdorffDistance(po.way,ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($1),4326),900913)) as hausdorf , \"source:geometry:date\" AS date, CONCAT(\"source:geometry:entity\",'/', \"source:geometry:oidn\") AS ref , \"source:geometry:version\" AS version , \"source:geometry:entity\" AS entity , \"addr:street\" AS street , \"addr:housenumber\" AS number FROM planet_osm_polygon po WHERE ST_Overlaps(po.way,ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($1),4326),900913)) ORDER BY 2 ASC LIMIT 1";

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
            //console.log("Checking osm id: " + osm_id);
            //process.exit();
            var rows = client.querySync(query,params);
            if (rows.length === 0 ) {
                console.log("No matching building found");
                return;
            }

            rows.forEach(row => {
                //console.log(`Id: ${row.osm_id} Internal ID: ${row.internal_id} Hausdorf: ${row.hausdorf}`);
                if (row.date) {
                    console.log(`Id: ${row.osm_id} Hausdorf: ${row.hausdorf} sourcedate: ${row.date.replace( /\//g, '-' )} sourceref: ${row.ref}`);
                } else if (row.version) {
                    console.log(`Id: ${row.osm_id} Hausdorf: ${row.hausdorf} sourceversion: ${row.version} sourceref: ${row.ref}`);
                } else  {
                    console.log(`Id: ${row.osm_id} Hausdorf: ${row.hausdorf} sourceref: ${row.ref}`);
                }
                //var res = [ ];
                if (row.hausdorf < 0.5 ) {
                    //console.log(util.inspect(result, false, null));
                    var filter = "$.osm.way[*][?(@.id=='" + osm_id + "')]";
                    var myway = jp.paths(result, filter);
                    //var myway = jp.paths(result, "$.osm.way[*][?(@.id=='480239761')]");
                    //console.log(result);
                    //console.log(myway);
                    // console.log(jp.stringify(myway[0]));
                    var xpath = jp.stringify(myway[0]);
                    var xindex = xpath.replace(/[^0-9]/g,'');

                    //var extra_attribute = { k: "source:geometry:ref", v: "row.ref" };
                    //var extra_attribute ='k="source:geometry:ref" v="123213"';
                    var extras = new Array();
                    if ( row.entity == 'Urbis') { 
                        if  (addresses[osm_id]) {
                            console.log(addresses[osm_id]);
                            // there is an urbis ref present
                            if (('Urbis/'+ addresses[osm_id].urbis) !== row.ref ){
                                console.log("non matching urbis refs");
                                var error = { "$": { "k": "note", "v": "Urbis ref mismatch! This building has a different unique ref in current Urbis data, perhaps demolished/replaced or rebuilt." } };
                                extras.push (error);
                                //process.exit();
                            }
                        }
                        var extra_date_attribute = { "$": { "k": "source:geometry:version", "v": row.version } };
                        var extra_ref_attribute = { "$": { "k": "source:geometry:ref", "v": row.ref } };
                        extras.push (extra_ref_attribute);
                        extras.push (extra_date_attribute);
                    } else {
                        var extra_date_attribute = { "$": { "k": "source:geometry:date", "v": row.date.replace( /\//g, '-' ) } };
                        var extra_ref_attribute = { "$": { "k": "source:geometry:ref", "v": row.ref } };
                        extras.push (extra_ref_attribute);
                        extras.push (extra_date_attribute);
                    }

                    var issues = false;
                    var msg = "";
                    if  (addresses[osm_id]) {
                        // console.log(addresses[osm_id]);
                        // process.exit();
                        if ( row.street !== null && row.street !== undefined ) {
                            if (addresses[osm_id].street.localeCompare(row.street) !== 0 ) {
                                //console.log("SFASFD:   " + row.street);
                                //console.log(row.street);
                                // When the street doesnt match, change it
                                // Search for the address tag in the XML
                                var afilter = "$.osm.way["+xindex+"].tag..[?(@.k=='addr:street')]";
                                var addr_path = jp.paths(result, afilter);
                                var xpatha = jp.stringify(addr_path[0]);
                                //console.log(xpatha);
                                var numberPattern = /\d+/g;
                                var smatch = xpatha.match( numberPattern );
                                // The second match (1) is the tag index
                                var xindexa = smatch[1];
                                console.warn(smatch);

                                // ex: $.osm.way[131].tag[1]["$"]
                                console.log(result.osm.way[xindex].tag[xindexa]["$"].v);
                                // save the wrong addres in another tag for check
                                var error_address = { "$": { "k": "old_street", "v": result.osm.way[xindex].tag[xindexa]["$"].v } };
                                extras.push (error_address);

                                // replace the address to the correct one
                                result.osm.way[xindex].tag[xindexa]["$"].v = row.street;
                                // console.log(result.osm.way[xindex]["tag"]);
                                console.log(result.osm.way[xindex].tag[xindexa]);
                                console.log("SFASFD:   " + row.street);

                                // street is not the same
                                issues=true;
                                msg+=" streetname: " + row.street;
                                stats['osm_has_street_error']++;
                            }
                        }
                        if ( row.number !== null && row.number !== undefined ) {
                            if (addresses[osm_id].number !== row.number ) {
                                // When the number doesnt match, change it
                                // Search for the housenumber tag in the XML
                                var hfilter = "$.osm.way["+xindex+"].tag..[?(@.k=='addr:housenumber')]";
                                var hnumber_path = jp.paths(result, hfilter);
                                var xpathh = jp.stringify(hnumber_path[0]);
                                //console.log(xpathh);
                                var numberPattern = /\d+/g;
                                var nmatch = xpathh.match( numberPattern );
                                // The second match (1) is the tag index
                                console.log(nmatch);
                                var xindexh = nmatch[1];

                                // ex: $.osm.way[131].tag[1]["$"]
                                console.log(result.osm.way[xindex].tag[xindexh]["$"].v);
                                // save the wrong addres in another tag for check
                                var error_number = { "$": { "k": "old_housenumber", "v": result.osm.way[xindex].tag[xindexh]["$"].v } };
                                extras.push (error_number);

                                console.log("SFASFD:   " + row.number);

                                // replace the number to the correct one
                                result.osm.way[xindex].tag[xindexh]["$"].v = row.number;

                                //process.exit();

                                issues=true;
                                msg+=" number: " + row.number;
                                stats['osm_has_number_error']++;
                            }

                            if (issues) {
                                var error = { "$": { "k": "fixme", "v": "Mismatch official data:" + msg } };
                                console.log(result.osm.way[xindex]["tag"]);
                                //process.exit();
                                extras.push (error);
                            }
                            if (osm_id == 875840272 ) {
                                console.log(result.osm.way[xindex]["$"]);
                                //process.exit();
                            }
                        }
                    }

                    // var visual_attribute = { "$": { "k": "fixme", "v": "check this stuff" } };
                    // extras.push (visual_attribute);

                    //console.log(extra_attribute);

                    //console.log(result.osm.way[2]["tag"]);
                    //console.log(result);
                    //console.log(result.osm.way[index]["tag"]);

                    result.osm.way[xindex]["$"].action='modify';
                    extras.forEach((value) => {
                        result.osm.way[xindex]["tag"].push(value);
                    });
                    //result.osm.way[xindex]["tag"].push(extra_ref_attribute);
                    //result.osm.way[xindex]["tag"].push(extra_date_attribute);
                    //result.osm.way[xindex]["tag"].push(visual_attribute);
                    //console.log(result);
                    // $.osm.way[2]["$"].id
                    //process.exit();
                    stats['matches']++;
                } else {
                    stats['misses']++;
                }
            })
        });

        console.log(stats);
        //console.log(result);

        //console.log(JSON.stringify(result, null, 4));
        // process.exit();
        var builder = new xml2js.Builder();
        var xml = builder.buildObject(result);
        //console.log(xml);

        fs.writeFileSync('data/output.osm', xml);

        //console.dir(result);
        console.log('Done');
    });
});

