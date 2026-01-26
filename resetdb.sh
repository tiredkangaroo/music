dropdb music --if-exists -f
createdb music -O musicer
psql -U musicer -d music -a -f schema.sql