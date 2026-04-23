const path = require("path");
const sqlite3 = require("sqlite3").verbose();

const allowDbOverride = String(process.env.NODE_ENV || "").trim() === "test";
const dbPath =
  allowDbOverride && process.env.DB_PATH ? path.resolve(process.env.DB_PATH) : path.resolve(__dirname, "../../data.sqlite");

const db = new sqlite3.Database(dbPath);

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(error) {
      if (error) return reject(error);
      resolve(this);
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (error, row) => {
      if (error) return reject(error);
      resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (error, rows) => {
      if (error) return reject(error);
      resolve(rows);
    });
  });
}

module.exports = {
  db,
  run,
  get,
  all,
};
