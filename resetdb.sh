# print the counts before resetting
psql -U musicer -c "SELECT COUNT(*) FROM tracks;" -d music
psql -U musicer -c "SELECT COUNT(*) FROM playlists;" -d music

dropdb music --if-exists -f
createdb music -O musicer
psql -U musicer -d music -a -f schema.sql