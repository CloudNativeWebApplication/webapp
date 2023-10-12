const { Sequelize, DataTypes } = require('sequelize');
const { v4: uuidv4 } = require('uuid');

const sequelize = new Sequelize('usersdb', 'root', 'newone', {
  host: '127.0.0.1',
  dialect: 'mysql',
});

const User = sequelize.define('User', {
  id: {
    type: DataTypes.UUID,
    primaryKey: true,
    defaultValue: () => uuidv4(),
  },
  first_name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  last_name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    validate: {
      isEmail: true,
    },
  },
  password: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  account_created: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    allowNull: false,
    readOnly: true, // Prevent users from setting this field
  },
  account_updated: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    allowNull: false,
    readOnly: true, // Prevent users from setting this field
  },
}, {
  tableName: 'users',
  timestamps: false,
});

module.exports = User;

