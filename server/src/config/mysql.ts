import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

export const mysqlPool = mysql.createPool({
  host: process.env.MYSQL_HOST,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
  port: parseInt(process.env.MYSQL_PORT || '3306', 10),
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000
});

async function testConnection() {
  try {
    const connection = await mysqlPool.getConnection();
    console.log('MySQL connection established successfully.');
    await connection.ping();
    connection.release();
  } catch (error) {
    console.error('Error connecting to MySQL.');
  }
}

testConnection();

export default mysqlPool;

