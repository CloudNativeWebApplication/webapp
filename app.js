const fs = require('fs');
const bodyParser = require('body-parser');
const loadUserCSV = require('./loadusercsv');
const express = require('express');
const { Sequelize } = require('sequelize');
const bcrypt = require('bcrypt');
const UserModel = require('./models/UserModel.js'); 
const AssignmentModel = require('./models/AssignmentModel.js')
const SubmissionModel = require('./models/SubmissionModel.js'); 
const dotenv = require('dotenv');
const winston = require('winston');
const StatsD = require('node-statsd');
const AWS = require('aws-sdk');
const User = require('./models/UserModel');
const Assignment = require('./models/AssignmentModel');
const Submission = require('./models/SubmissionModel');





const app = express();
app.use(bodyParser.json());
const PORT = 6969;

const filePath = './user.csv'; 
loadUserCSV(filePath);

dotenv.config();

// Access environment variables
const DATABASE_URL = process.env.DATABASE_URL;
const DB_USERNAME = process.env.DB_USERNAME;
const DB_PASSWORD = process.env.DB_PASSWORD;
const DB_NAME = process.env.DB_NAME;
const SNS_ARN = process.env.SNS_ARN;


const sequelize = new Sequelize(DATABASE_URL, {
  dialect: 'mysql',
  username: DB_USERNAME,
  password: DB_PASSWORD,
});

// Define relationships
User.hasMany(Assignment, { foreignKey: 'user_id' });
Assignment.belongsTo(User, { foreignKey: 'user_id' });

Assignment.hasMany(Submission, { foreignKey: 'assignment_id' });
Submission.belongsTo(Assignment, { foreignKey: 'assignment_id' });


async function createDatabase() {
  try {
    await sequelize.query(`CREATE DATABASE IF NOT EXISTS ${DB_NAME};`);
    logger.info('database created')
    console.log('Database created successfully.');
    
  } catch (error) {
    console.error('Error creating database:', error);
  }
}

createDatabase().then(() => {
  testDatabaseConnection().then(startup);
});

startup();


async function testDatabaseConnection() {
  try {
    await sequelize.authenticate();
    console.log('Database connection has been established successfully.');

  } catch (error) {
    console.error('Unable to connect to the database:', error);
  }
}

async function hashPassword(password) {
  // Use BCrypt to hash the password
  const saltRounds = 10;
  return bcrypt.hash(password, saltRounds);
}

async function insertOrUpdateUser(user) {
  try {
    const existingUser = await UserModel.findOne({ where: { email: user.email } });

    if (existingUser) {
      console.log(`User with email ${user.email} already exists.`);
    } else {
      // Hash the user's password before storing it
      const hashedPassword = await hashPassword(user.password);

      // Create a new user record with the hashed password
      await UserModel.create({
        first_name: user.first_name,
        last_name: user.last_name,
        email: user.email,
        password: hashedPassword, // Store the hashed password
      });
      console.log(`User with email ${user.email} inserted.`);
    }
  } catch (error) {
    console.error('Error inserting/updating user:', error.message);
  }
}

// Middleware to reject requests with a request body
const rejectRequestsWithBody = (req, res, next) => {
  const contentLength = req.headers['content-length'];
  if (contentLength && parseInt(contentLength) > 0) {
    return res.status(400).json({ error: 'Request body is not allowed for this endpoint' });
  }

  if (Object.keys(req.query).length > 0) {
    return res.status(400).json({ error: 'Query parameters are not allowed for this endpoint' });
  }

  next();
};


async function startup() {
  try {
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const rows = fileContent.trim().split('\n');
    const headers = rows.shift().split(',');

    const users = rows.map((row) => {
      const values = row.split(',');
      const user = {};
      headers.forEach((header, index) => {
        user[header] = values[index].trim();
      });
      return user;
    });

    //console.log('Data loaded from CSV:', users);

    await UserModel.sync();
    console.log('User model synchronized with the database.');

    // Synchronize the AssignmentModel with the database
    await AssignmentModel.sync();
    console.log('Assignment model synchronized with the database.');

    await SubmissionModel.sync();
    console.log('Submission model synchronized with the database.');


    for (const user of users) {
      if (!user.email || !user.password) {
        console.error('Invalid user data:', user);
        continue;
      }
      await insertOrUpdateUser(user);
    }

    const fetchedUsers = await UserModel.findAll();
    fetchedUsers.forEach((user) => {
      console.log(`User ID: ${user.id}, First Name: ${user.first_name}, Last Name: ${user.last_name}, Email: ${user.email}`);
    });
  } catch (error) {
    console.error('Error loading and creating user accounts:', error.message);
  }
}

app.use(express.json());
     

const logger = winston.createLogger({
  level: 'silly',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'csye6225.log' })
  ]
});

const client = new StatsD({
  errorHandler: function (error) {
    console.error("StatsD error: ", error);
  }
});

app.route('/healthz')
  .get(rejectRequestsWithBody, async (req, res) => {
    try {
      if (req.method === 'GET') {
        if (req.body && Object.keys(req.body).length > 0) {
          // Reject the request with a 400 Bad Request status code
          res.status(400).send('GET requests should not include a request body');
          logger.warn('body is not allowed')

          
        } else {
          // Handle GET request

          // Assuming you want to check if the database connection is successful
          await sequelize.authenticate();

          res.setHeader('Cache-Control', 'no-cache');
          
          res.status(200).send()
          logger.http('Health check passed', { timestamp: new Date().toString() });
          client.increment('endpoint.healthz.hits');

        }
      } 
    } catch (error) {
      console.error(error);
      logger.error(`Health check failed: ${error.message}`);
      res.status(503).json({ error: 'Service unavailable' });
    }
  })
  .all((req, res) => {
    logger.error(`Attempt to access /healthz with unsupported method ${req.method}`, { timestamp: new Date().toString() });
    res.status(405).json({ error: 'Method Not Allowed' });
    client.increment('endpoint.healthzothermethod.hits');
  });


async function hashPassword(password) {
  const saltRounds = 10;
  return bcrypt.hash(password, saltRounds);
}


// Middleware for basic authentication
const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const encodedCredentials = authHeader.split(' ')[1];
  const decodedCredentials = Buffer.from(encodedCredentials, 'base64').toString('utf-8');
  const [providedEmail, providedPassword] = decodedCredentials.split(':');

  if (!providedEmail || !providedPassword) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const user = await UserModel.findOne({ where: { email: providedEmail } });

    if (!user || !(await bcrypt.compare(providedPassword, user.password))) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    } 

    // Attach the user object to the request for later use, e.g., req.user
    req.user = user;

    next();
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};



app.use(express.json());


// Create Assignment
app.post('/v3/assignments', authenticate, async (req, res) => {
  try {
    await sequelize.authenticate();
    // Specify the fields you want to accept
    const allowedFields = ['name', 'points', 'num_of_attempts', 'deadline'];

      // Extract only the allowed fields from the request body
      const assignmentData = {};
      for (const field of allowedFields) {
        if (req.body[field]) {
          assignmentData[field] = req.body[field];
        }
      }

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        // Perform data type validation for each field
        if (field === 'name' && typeof req.body[field] === 'string') {
          assignmentData[field] = req.body[field];
        } else if (field === 'points' && Number.isInteger(req.body[field])) {
          assignmentData[field] = req.body[field];
        } else if (field === 'num_of_attempts' && Number.isInteger(req.body[field]) && req.body[field] >= 1) {
          assignmentData[field] = req.body[field];
        } else if (field === 'deadline' && !isNaN(Date.parse(req.body[field]))) {
          assignmentData[field] = req.body[field];
        } else {
          return res.status(400).json({ error: `Invalid data type for field: ${field}` });
        }
      }
    }


    // Validate assignment data here
    if (
      !assignmentData.name ||
      !assignmentData.points ||
      !assignmentData.num_of_attempts ||
      !assignmentData.deadline
    ) {
      return res.status(400).json({ error: 'All assignment fields are required' });
    }

    // Ensure assignment points are between 1 and 10
    if (assignmentData.points < 1 || assignmentData.points > 10) {
      return res.status(400).json({ error: 'Assignment points must be between 1 and 10' });
    }

    // Get the authenticated user's email from the request
    const authHeader = req.headers.authorization;
    const encodedCredentials = authHeader.split(' ')[1];
    const decodedCredentials = Buffer.from(encodedCredentials, 'base64').toString('utf-8');
    const [providedEmail] = decodedCredentials.split(':');

    // Find the user in the database based on the provided email
    const user = await UserModel.findOne({ where: { email: providedEmail } });

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // Associate the assignment with the authenticated user
    assignmentData.user_id = user.id;

    // Attempt to create the assignment in the database
    try {
      
      const createdAssignment = await AssignmentModel.create(assignmentData);

      res.status(201).json(createdAssignment);
      logger.http('assignment is created', { timestamp: new Date().toString() });
      client.increment('endpoint.assignment.post.hit');
      
    } catch (error) {
      console.error(error);
      res.status(503).json({ error: 'Service unavailable' });
    }
  } catch (error) {
    console.error(error);
    res.status(503).json({ error: 'Service unavailable' });
  }
});



// Delete Assignment by ID
app.delete('/v3/assignments/:id',rejectRequestsWithBody, authenticate, async (req, res) => {
  try {
    const assignmentId = req.params.id;

    // Find the assignment by ID
    const assignment = await AssignmentModel.findByPk(assignmentId);

    if (!assignment) {
      return res.status(404).json({ error: 'Assignment not found' });
    }

    // Check if the authenticated user is the assignment owner
    if (assignment.user_id !== req.user.id) {
      logger.error('user is trying to delete other user assignments');
      return res.status(403).json({ error: 'Permission denied. You can only delete your own assignments.' });
    }

    // Delete the assignment
    await assignment.destroy();

    res.status(204).json({ message: 'Assignment successfully deleted' }); // Send success message

    logger.http('assignment is deleted', { timestamp: new Date().toString() });
    client.increment('endpoint.assignment.delete.hit');

  } catch (error) {
    console.error('Error deleting assignment:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});




// Get Assignment by ID
app.get('/v3/assignments/:assignmentId', rejectRequestsWithBody, authenticate, async (req, res) => {
  try {
    const assignmentId = req.params.assignmentId;

    // Find the assignment by ID
    const assignment = await AssignmentModel.findByPk(assignmentId);

    if (!assignment) {
      return res.status(404).json({ error: 'Assignment not found' });
    }

    // Check if the authenticated user is the assignment owner
    if (assignment.user_id !== req.user.id) {
      logger.error('user is trying to access other user assignments');
      return res.status(403).json({ error: 'Permission denied. You can only access your own assignments.' });
    }

    res.status(200).json(assignment);
    client.increment('endpoint.assignment.getbyid.hit');
  } catch (error) {
    console.error('Error getting assignment by ID:', error);
    res.status(503).json({ error: 'Internal Server Error' });
  }
});

app.patch('/v3/assignments/:id', (req, res) => {
  res.status(405).json({ error: 'Update (PATCH) is not allowed' });

});

// Get all Assignments of a user by authentication
app.get('/v3/assignments',rejectRequestsWithBody, authenticate, async (req, res) => {
  try {
    // Use the authenticated user from the middleware
    const authenticatedUser = req.user;

    // Find all assignments associated with the authenticated user's id
    const userAssignments = await AssignmentModel.findAll({
      where: { user_id: authenticatedUser.id },   
    });
        
    if (!userAssignments) {
      logger.error('assignment is not found');
      return res.status(404).json({ error: 'Assignments not found for this user' });
      
    }

    res.status(200).json(userAssignments);
    logger.http("got user assignment")
    client.increment('endpoint.assignments.get.hit');
  } catch (error) {
    console.error('Error getting assignments for user:', error);
    res.status(503).json({ error: 'Internal Server Error' });
  }
});

app.put('/v3/assignments/:id', async (req, res) => {
  try {
    const assignmentId = req.params.id;
    const updatedAssignmentData = req.body;

    const assignment = await AssignmentModel.findByPk(assignmentId);

    const allowedFields = ['email', 'password', 'first_name', 'last_name'];

    if (!assignment) {
      return res.status(404).json({ error: 'Assignment not found' });
    }

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        // Perform data type validation for each field
        if (field === 'name' && typeof req.body[field] === 'string') {
          assignmentData[field] = req.body[field];
        } else if (field === 'points' && Number.isInteger(req.body[field])) {
          assignmentData[field] = req.body[field];
        } else if (field === 'num_of_attempts' && Number.isInteger(req.body[field]) && req.body[field] >= 1) {
          assignmentData[field] = req.body[field];
        } else if (field === 'deadline' && !isNaN(Date.parse(req.body[field]))) {
          assignmentData[field] = req.body[field];
        } else {
          return res.status(400).json({ error: `Invalid data type for field: ${field}` });
        }
      }
    }

    // Validate and update each field
    if ('name' in updatedAssignmentData && updatedAssignmentData.name !== null) {
      assignment.name = updatedAssignmentData.name;
    } else {
      return res.status(400).json({ error: 'name is required and cannot be null.' });
    }

    if ('points' in updatedAssignmentData && updatedAssignmentData.points !== null) {
      const points = parseInt(updatedAssignmentData.points, 10);
      if (!isNaN(points) && points >= 1 && points <= 10) {
        assignment.points = points;
      } else {
        return res.status(400).json({ error: 'Invalid value for points. It must be an integer between 1 and 10.' });
      }
    } else {
      return res.status(400).json({ error: 'points is required and cannot be null.' });
    }

    if ('num_of_attempts' in updatedAssignmentData && updatedAssignmentData.num_of_attempts !== null) {
      const num_of_attempts = parseInt(updatedAssignmentData.num_of_attempts, 10);
      if (!isNaN(num_of_attempts) && num_of_attempts >= 1) {
        assignment.num_of_attempts = num_of_attempts;
      } else {
        return res.status(400).json({ error: 'Invalid value for num_of_attempts. It must be an integer greater than or equal to 1.' });
      }
    } else {
      return res.status(400).json({ error: 'num_of_attempts is required and cannot be null.' });
    }

    if ('deadline' in updatedAssignmentData && updatedAssignmentData.deadline !== null) {
      assignment.deadline = updatedAssignmentData.deadline;
    } else {
      return res.status(400).json({ error: 'deadline is required and cannot be null.' });
    }

    // Update the assignment_updated field
    assignment.assignment_updated = new Date();

    // Save the updated assignment
    await assignment.save();

    res.status(204).json('');
    client.increment('endpoint.assignment.put.hit');
  } catch (error) {
    console.error('Error updating assignment:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

AWS.config.update({
  region: 'us-east-1',  
});

function publishToSNSTopic(message, topicArn) {
  // AWS SDK will automatically use the IAM role associated with the EC2 instance
  const sns = new AWS.SNS();

  const params = {
    Message: JSON.stringify(message),
    TopicArn: topicArn,
  };

  return sns.publish(params).promise();
}


app.post('/v3/assignments/:id/submission', authenticate, async (req, res) => {
  try {
    const assignmentId = req.params.id;
    const { submission_url } = req.body;
    const userEmail = req.user.email; 

    // Check if submission_url exists and is a non-empty string
    if (!submission_url || typeof submission_url !== 'string' || !submission_url.trim()) {
      return res.status(400).json({ error: 'Submission URL is missing or empty' });
    }


    // Check if the assignment's deadline has passed
    const assignment = await AssignmentModel.findByPk(assignmentId);
    if (new Date() > new Date(assignment.deadline)) {
      return res.status(400).json({ error: 'Deadline for this assignment has passed' });
    }

    // Check for existing submissions and retry limit
    const existingSubmissions = await SubmissionModel.findAll({
      include: [{
        model: AssignmentModel,
        include: [{
          model: UserModel,
          where: { email: userEmail }
        }]
      }],
      where: { assignment_id: assignmentId }
    });

    if (existingSubmissions.length >= assignment.num_of_attempts) {
      return res.status(400).json({ error: 'Retry limit exceeded' });
    }

    // Create new submission
    const newSubmission = await SubmissionModel.create({
      assignment_id: assignmentId,
      submission_url
    });


    // Prepare the message for SNS
    const message = {
      assignmentId: assignmentId,
      submissionUrl: submission_url,
      userEmail: userEmail
    };



  
    const topicArn = SNS_ARN;

    // Publish the message to the SNS topic
     await publishToSNSTopic(message, topicArn);

    res.status(201).json(newSubmission);
  } catch (error) {
    console.error('Error:', error);
    res.status(503).json({ error: 'Service Unavailable' });
  }
});

  
    

  


logger.exceptions.handle(
  new winston.transports.File({ filename: 'csye6225.log' })
);

process.on('unhandledRejection', (ex) => {
  throw ex;
});


testDatabaseConnection().then(() => {
  app.listen(PORT, () => {
    console.log('Server running on ' + PORT);
    logger.info('Server is running'+ PORT);
  });
});





module.exports = app;







