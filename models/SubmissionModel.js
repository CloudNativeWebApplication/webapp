const { Sequelize, DataTypes } = require('sequelize');
const { v4: uuidv4 } = require('uuid');
const dotenv = require('dotenv');
const path = require('path');




// Load the .env file from the appropriate directory
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Access environment variables
const DB_USERNAME = process.env.DB_USERNAME;
const DB_PASSWORD = process.env.DB_PASSWORD;
const DB_HOST = process.env.DB_HOST;
const DB_NAME = process.env.DB_NAME


const sequelize = new Sequelize(DB_NAME,DB_USERNAME,DB_PASSWORD, {
  dialect: 'mysql',
  host: DB_HOST,
});

const Submission = sequelize.define('Submission', {
  id: {
    type: DataTypes.UUID,
    defaultValue: () => uuidv4(),
    primaryKey: true,
  },
  assignment_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'assignments', // Name of the table
      key: 'id',
    },
  },
  submission_url: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  submission_date: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    allowNull: false,
    readOnly: true,
  },
  submission_updated: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    allowNull: false,
    readOnly: true,
  },
}, {
  tableName: 'submissions',
  timestamps: false,
});

module.exports = Submission;
