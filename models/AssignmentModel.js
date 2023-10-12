const { Sequelize, DataTypes } = require('sequelize');
const { v4: uuidv4 } = require('uuid'); // Import the UUID library
const dotenv = require('dotenv');


const sequelize = new Sequelize('usersdb', 'root', 'newone', {
  host: '127.0.0.1',
  dialect: 'mysql',
  dialectOptions: {
    createDatabaseIfNotExists: true,
  },
});

const Assignment = sequelize.define('Assignment', {
  id: {
    type: DataTypes.UUID, // Change the data type to UUID
    defaultValue: () => uuidv4(), // Generate a random UUID
    primaryKey: true,
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  points: {
    type: DataTypes.INTEGER,
    allowNull: false,
    validate: {
      min: 1,
      max: 10,
    },
  },
  num_of_attempts: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  deadline: {
    type: DataTypes.DATE,
    allowNull: false,
  },
  assignment_created: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    allowNull: false,
    readOnly: true,
  },
  assignment_updated: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    allowNull: false,
    readOnly: true,
  },
  user_id: {
    type: DataTypes.UUID, // You can also use UUID for foreign keys
    allowNull: false,
  },
}, {
  tableName: 'assignments',
  timestamps: false,
});

module.exports = Assignment;

