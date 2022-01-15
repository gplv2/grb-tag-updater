--
-- PostgreSQL database dump
--

-- Dumped from database version 12.9 (Ubuntu 12.9-2.pgdg20.04+1)
-- Dumped by pg_dump version 12.9 (Ubuntu 12.9-0ubuntu0.20.04.1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: planet_osm_polygon; Type: TABLE; Schema: public; Owner: grb-data
--

CREATE TABLE public.planet_building_polygon (
    osm_id bigint,
    access text,
    "addr:housename" text,
    "addr:housenumber" text,
    "addr:interpolation" text,
    "addr:street" text,
    "addr:flats" text,
    admin_level text,
    aerialway text,
    aeroway text,
    amenity text,
    area text,
    barrier text,
    bicycle text,
    brand text,
    bridge text,
    boundary text,
    building text,
    construction text,
    covered text,
    culvert text,
    cutting text,
    denomination text,
    disused text,
    embankment text,
    foot text,
    "generator:source" text,
    harbour text,
    highway text,
    historic text,
    horse text,
    intermittent text,
    junction text,
    landuse text,
    layer text,
    leisure text,
    lock text,
    man_made text,
    military text,
    motorcar text,
    name text,
    "natural" text,
    office text,
    oneway text,
    operator text,
    place text,
    population text,
    power text,
    power_source text,
    public_transport text,
    railway text,
    ref text,
    religion text,
    route text,
    service text,
    shop text,
    sport text,
    surface text,
    "source:geometry:date" text,
    "source:geometry:oidn" text,
    "source:geometry:uidn" text,
    "source:geometry:entity" text,
    "source:geometry:ref" text,
    "source:geometry" text,
    toll text,
    tourism text,
    "tower:type" text,
    tracktype text,
    tunnel text,
    water text,
    waterway text,
    wetland text,
    width text,
    wood text,
    z_order integer,
    way_area real,
    source text,
    source_ref text,
    comment text,
    fixme text,
    tags public.hstore,
    way public.geometry(Geometry,900913)
);


ALTER TABLE public.planet_building_polygon OWNER TO "grb-data";

--
-- Name: idx_planet_osm_id; Type: INDEX; Schema: public; Owner: grb-data
--

CREATE INDEX idx_planet_build_osm_id ON public.planet_building_polygon USING btree (osm_id);


--
-- Name: idx_planet_osm_line_nobridge; Type: INDEX; Schema: public; Owner: grb-data
--

CREATE INDEX idx_planet_build_osm_line_nobridge ON public.planet_building_polygon USING gist (way) WHERE ((man_made <> ALL (ARRAY[''::text, '0'::text, 'no'::text])) OR (man_made IS NOT NULL));


--
-- Name: idx_pop_hw_null; Type: INDEX; Schema: public; Owner: grb-data
--

CREATE INDEX idx_pop_build_hw_null ON public.planet_building_polygon USING gist (way) WHERE (highway IS NOT NULL);


--
-- Name: idx_pop_mm_null; Type: INDEX; Schema: public; Owner: grb-data
--

CREATE INDEX idx_pop_build_mm_null ON public.planet_building_polygon USING gist (way) WHERE (man_made IS NOT NULL);


--
-- Name: idx_pop_no_b; Type: INDEX; Schema: public; Owner: grb-data
--

CREATE INDEX idx_pop_build_no_b ON public.planet_building_polygon USING gist (way) WHERE (building <> ALL (ARRAY[''::text, '0'::text, 'no'::text]));


--
-- Name: idx_pop_no_bridge; Type: INDEX; Schema: public; Owner: grb-data
--

CREATE INDEX idx_pop_build_no_bridge ON public.planet_building_polygon USING gist (way) WHERE (bridge <> ALL (ARRAY[''::text, '0'::text, 'no'::text]));


--
-- Name: idx_pop_no_hw; Type: INDEX; Schema: public; Owner: grb-data
--

CREATE INDEX idx_pop_build_no_hw ON public.planet_building_polygon USING gist (way) WHERE (highway <> ALL (ARRAY[''::text, '0'::text, 'no'::text]));


--
-- Name: planet_osm_polygon_way_idx; Type: INDEX; Schema: public; Owner: grb-data
--

CREATE INDEX planet_osm_build_polygon_way_idx ON public.planet_building_polygon USING gist (way) WITH (fillfactor='100');


--
-- PostgreSQL database dump complete
--

