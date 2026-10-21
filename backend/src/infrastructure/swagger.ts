import swaggerJsdoc from 'swagger-jsdoc';

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'SmartCard Pro API',
      version: '1.0.0',
      description: 'API for SmartCard Pro platform',
    },
    servers: [{ url: 'http://localhost:3001/api' }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
    security: [{ bearerAuth: [] }],
  },
  apis: ['./src/modules/**/*.controller.ts', './src/modules/**/*.dto.ts'],
};

export default swaggerJsdoc(options);
