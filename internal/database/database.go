package database

import (
	"database/sql"
	"log"

	_ "github.com/mattn/go-sqlite3"
)

var DB *sql.DB

func Initialize(dbPath string) error {
	var err error
	DB, err = sql.Open("sqlite3", dbPath+"?_foreign_keys=on&_journal_mode=WAL")
	if err != nil {
		return err
	}

	// Test connection
	if err = DB.Ping(); err != nil {
		return err
	}

	log.Println("Database connected successfully")

	// Run migrations
	if err = RunMigrations(); err != nil {
		return err
	}

	return nil
}

func Close() {
	if DB != nil {
		DB.Close()
	}
}
