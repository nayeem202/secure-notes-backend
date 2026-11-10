import { MAX_OFFSET } from '../../../domain/pagination.js';

const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
const parameter = (name) => ({ $ref: `#/components/parameters/${name}` });
const object = (properties, required = Object.keys(properties)) => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
});
const page = (name) =>
  object({ data: { type: 'array', items: ref(name) }, pagination: ref('Pagination') });
const result = (name, schema) => object({ data: object({ [name]: ref(schema) }) });
const json = (schema) => ({ 'application/json': { schema } });
const date = { type: 'string', format: 'date-time' };
const name = { type: 'string', minLength: 2, maxLength: 80, example: 'Reviewer' };
const email = { type: 'string', format: 'email', maxLength: 254, example: 'reviewer@example.com' };
const username = {
  type: 'string',
  minLength: 3,
  maxLength: 30,
  pattern: '^[a-z0-9](?:[a-z0-9._-]{1,28}[a-z0-9])$',
  description: 'Unique and normalized to lowercase.',
  example: 'reviewer',
};
const password = {
  type: 'string',
  format: 'password',
  minLength: 6,
  maxLength: 72,
  description: 'At most 72 UTF-8 bytes.',
};
const interests = {
  type: 'array',
  maxItems: 20,
  default: [],
  items: { type: 'string', minLength: 1, maxLength: 40 },
  example: ['chess', 'reading'],
};
const title = { type: 'string', minLength: 1, maxLength: 160 };
const content = { type: 'string', maxLength: 20000 };
const accountFields = { name, username, email, password, interests };
const patch = (properties) => ({ ...object(properties, []), minProperties: 1 });
const listParameters = [parameter('Page'), parameter('Limit')];
const errors = Object.fromEntries(
  [400, 401, 403, 404, 409, 413, 415, 429, 500, 503].map((status) => [
    status,
    { $ref: '#/components/responses/Error' },
  ]),
);

function operation(tag, operationId, summary, options = {}) {
  const {
    body,
    response,
    status = 200,
    public: isPublic = false,
    parameters = [],
    description,
    responses = {},
  } = options;
  return {
    tags: [tag],
    operationId,
    summary,
    ...(description ? { description } : {}),
    ...(isPublic ? { security: [] } : {}),
    parameters: [
      ...parameters,
      ...(body || status === 204
        ? [parameter(isPublic ? 'AnonymousWriteProtection' : 'WriteProtection')]
        : []),
    ],
    ...(body ? { requestBody: { required: true, content: json(ref(body)) } } : {}),
    responses: {
      [status]:
        status === 204
          ? { description: 'Completed; no response body.' }
          : { description: 'Success', content: json(ref(response)) },
      ...errors,
      ...responses,
    },
  };
}

export function createOpenApi(config) {
  const schemas = {
    ObjectId: { type: 'string', pattern: '^[a-fA-F0-9]{24}$', example: '507f1f77bcf86cd799439011' },
    Pagination: object({
      page: { type: 'integer', minimum: 1 },
      limit: { type: 'integer', minimum: 1, maximum: 100 },
      total: { type: 'integer', minimum: 0 },
      totalPages: { type: 'integer', minimum: 0 },
      hasNextPage: { type: 'boolean' },
      hasPreviousPage: { type: 'boolean' },
    }),
    User: object({
      _id: ref('ObjectId'),
      name,
      username,
      email,
      role: { type: 'string', enum: ['user', 'admin'] },
      interests,
      isActive: { type: 'boolean' },
      createdAt: date,
      updatedAt: date,
    }),
    PublicAuthor: object({ _id: ref('ObjectId'), username }),
    Note: object({
      _id: ref('ObjectId'),
      owner: ref('PublicAuthor'),
      title,
      content,
      createdAt: date,
      updatedAt: date,
    }),
    Post: object({
      _id: ref('ObjectId'),
      author: ref('PublicAuthor'),
      title,
      content,
      createdAt: date,
      updatedAt: date,
    }),
    Session: object({
      user: ref('User'),
      accessToken: { type: 'string' },
      expiresIn: { type: 'integer', example: 900 },
    }),
    SessionResult: object({ data: ref('Session') }),
    UserResult: result('user', 'User'),
    NoteResult: result('note', 'Note'),
    PostResult: result('post', 'Post'),
    UserUpdateResult: object({
      data: object(
        {
          user: ref('User'),
          accessToken: { type: 'string' },
          expiresIn: { type: 'integer' },
        },
        ['user'],
      ),
    }),
    UserPage: page('User'),
    NotePage: page('Note'),
    PostPage: page('Post'),
    PublicUserPosts: object({
      user: object({ username }),
      data: { type: 'array', items: ref('Post') },
      pagination: ref('Pagination'),
    }),
    InterestGroup: object({
      interest: { type: 'string' },
      userCount: { type: 'integer', minimum: 0 },
      users: { type: 'array', items: object({ username }) },
      usersPagination: ref('Pagination'),
    }),
    InterestPage: page('InterestGroup'),
    Register: object(accountFields, ['name', 'username', 'email', 'password']),
    Logout: object({}),
    Login: {
      ...object(
        {
          username,
          email,
          password: { type: 'string', format: 'password', minLength: 1, maxLength: 256 },
        },
        ['password'],
      ),
      oneOf: [{ required: ['username'] }, { required: ['email'] }],
      example: { username: 'reviewer', password: 'your-password' },
    },
    ProfileUpdate: patch({ name, username, interests: { ...interests, default: undefined } }),
    PasswordUpdate: object({
      currentPassword: { type: 'string', format: 'password', minLength: 1, maxLength: 256 },
      newPassword: password,
    }),
    UserCreate: object(
      {
        ...accountFields,
        role: { type: 'string', enum: ['user', 'admin'], default: 'user' },
      },
      ['name', 'username', 'email', 'password'],
    ),
    UserUpdate: patch({
      name,
      username,
      email,
      password,
      interests: { ...interests, default: undefined },
      role: { type: 'string', enum: ['user', 'admin'] },
      isActive: { type: 'boolean' },
    }),
    NoteCreate: object({ title, content: { ...content, default: '' } }, ['title']),
    NoteUpdate: patch({ title, content }),
    PostCreate: object({ title, content: { ...content, minLength: 1 } }),
    PostUpdate: patch({ title, content: { ...content, minLength: 1 } }),
    Health: object({ status: { type: 'string', enum: ['ok', 'ready', 'unavailable'] } }),
    Error: object({
      error: {
        type: 'object',
        required: ['code', 'message'],
        properties: {
          code: { type: 'string' },
          message: { type: 'string' },
          requestId: { type: 'string' },
          details: { type: 'array', items: { type: 'object' } },
        },
      },
    }),
  };
  return {
    openapi: '3.1.0',
    info: {
      title: 'Secure Notes API',
      version: '1.0.0',
      description: [
        'Interactive documentation for the deployed Secure Notes backend.',
        '1. Register a unique account or log in using **Try it out**.',
        '2. Copy **data.accessToken** from the response.',
        '3. Click **Authorize** and paste the token without the Bearer prefix.',
        '4. Test private notes and your own posts. Administrator routes require an administrator account.',
        'Public posts can be read without logging in. Notes require authentication.',
        'Authorization is kept in memory. Log out to revoke the token; sign in again after expiry.',
      ].join('\n\n'),
    },
    servers: [{ url: config.API_ORIGIN || '/', description: 'Current backend' }],
    security: [{ bearerAuth: [] }],
    tags: [
      { name: 'Authentication' },
      { name: 'Notes' },
      { name: 'Posts' },
      { name: 'Administration', description: 'Administrator account required.' },
      { name: 'Health' },
    ],
    paths: {
      '/api/auth/register': {
        post: operation('Authentication', 'register', 'Register an account', {
          public: true,
          body: 'Register',
          response: 'SessionResult',
          status: 201,
        }),
      },
      '/api/auth/login': {
        post: operation('Authentication', 'login', 'Sign in with username or email', {
          public: true,
          body: 'Login',
          response: 'SessionResult',
        }),
      },
      '/api/auth/me': {
        get: operation('Authentication', 'getProfile', 'Read your profile', {
          response: 'UserResult',
        }),
        patch: operation('Authentication', 'updateProfile', 'Update your profile', {
          body: 'ProfileUpdate',
          response: 'UserResult',
        }),
      },
      '/api/auth/password': {
        patch: operation(
          'Authentication',
          'changePassword',
          'Change password and revoke other sessions',
          {
            body: 'PasswordUpdate',
            response: 'SessionResult',
          },
        ),
      },
      '/api/auth/logout': {
        post: operation('Authentication', 'logout', 'Sign out and revoke existing sessions', {
          body: 'Logout',
          status: 204,
        }),
      },
      '/api/notes': {
        get: operation('Notes', 'listOwnNotes', 'List your private notes', {
          parameters: listParameters,
          response: 'NotePage',
        }),
        post: operation('Notes', 'createNote', 'Create a private note', {
          body: 'NoteCreate',
          response: 'NoteResult',
          status: 201,
        }),
      },
      '/api/notes/{id}': {
        parameters: [parameter('Id')],
        get: operation('Notes', 'getNote', 'Read a note', {
          response: 'NoteResult',
          description: 'Owners can read their own notes. Administrators can read any note.',
        }),
        patch: operation('Notes', 'updateNote', 'Update your own note', {
          body: 'NoteUpdate',
          response: 'NoteResult',
        }),
        delete: operation('Notes', 'deleteNote', 'Delete your own note', { status: 204 }),
      },
      '/api/posts': {
        get: operation('Posts', 'listPosts', 'List public posts', {
          public: true,
          parameters: listParameters,
          response: 'PostPage',
        }),
        post: operation('Posts', 'createPost', 'Publish a post', {
          body: 'PostCreate',
          response: 'PostResult',
          status: 201,
        }),
      },
      '/api/posts/{id}': {
        parameters: [parameter('Id')],
        get: operation('Posts', 'getPost', 'Read a public post', {
          public: true,
          response: 'PostResult',
        }),
        patch: operation('Posts', 'updatePost', 'Update your own post', {
          body: 'PostUpdate',
          response: 'PostResult',
        }),
        delete: operation('Posts', 'deletePost', 'Delete your own post', { status: 204 }),
      },
      '/api/users/{username}/posts': {
        get: operation('Posts', 'getUserPosts', 'List public posts by username', {
          public: true,
          parameters: [parameter('Username'), ...listParameters],
          response: 'PublicUserPosts',
          description:
            'One aggregate with a Posts lookup. The public user object contains only username.',
        }),
      },
      '/api/admin/users': {
        get: operation('Administration', 'listUsers', 'List users', {
          parameters: listParameters,
          response: 'UserPage',
        }),
        post: operation('Administration', 'createUser', 'Create a user', {
          body: 'UserCreate',
          response: 'UserResult',
          status: 201,
        }),
      },
      '/api/admin/users/{id}': {
        parameters: [parameter('Id')],
        get: operation('Administration', 'getUser', 'Read a user', { response: 'UserResult' }),
        patch: operation(
          'Administration',
          'updateUser',
          'Update a user and revoke existing sessions',
          { body: 'UserUpdate', response: 'UserUpdateResult' },
        ),
        delete: operation('Administration', 'deleteUser', 'Delete a user and their notes/posts', {
          status: 204,
          description: 'Administrators cannot delete their own account.',
        }),
      },
      '/api/admin/notes': {
        get: operation('Administration', 'listAllNotes', 'Read notes from all users', {
          parameters: [...listParameters, { name: 'owner', in: 'query', schema: username }],
          response: 'NotePage',
        }),
      },
      '/api/admin/analytics/interests': {
        get: operation('Administration', 'groupUsersByInterests', 'Group users by interest', {
          parameters: [
            ...listParameters,
            {
              name: 'interest',
              in: 'query',
              schema: { type: 'string', minLength: 1, maxLength: 40 },
            },
            parameter('MemberPage'),
            parameter('MemberLimit'),
          ],
          response: 'InterestPage',
          description: 'One aggregate; groups and member usernames are independently paginated.',
        }),
      },
      '/health/live': {
        get: operation('Health', 'liveness', 'Check process liveness', {
          public: true,
          response: 'Health',
        }),
      },
      '/health/ready': {
        get: operation('Health', 'readiness', 'Check database readiness', {
          public: true,
          response: 'Health',
          responses: {
            503: {
              description: 'Database unavailable.',
              content: json({ oneOf: [ref('Health'), ref('Error')] }),
            },
          },
        }),
      },
    },
    components: {
      securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
      schemas,
      parameters: {
        Page: {
          name: 'page',
          in: 'query',
          description: `Offset (page - 1) × limit must not exceed ${MAX_OFFSET}.`,
          schema: { type: 'integer', minimum: 1, maximum: 100001, default: 1 },
        },
        Limit: {
          name: 'limit',
          in: 'query',
          schema: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
        },
        MemberPage: {
          name: 'memberPage',
          in: 'query',
          description: `Member offset must not exceed ${MAX_OFFSET}.`,
          schema: { type: 'integer', minimum: 1, maximum: 100001, default: 1 },
        },
        MemberLimit: {
          name: 'memberLimit',
          in: 'query',
          schema: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
        },
        Id: { name: 'id', in: 'path', required: true, schema: ref('ObjectId') },
        Username: { name: 'username', in: 'path', required: true, schema: username },
        AnonymousWriteProtection: {
          name: 'X-CSRF-Protection',
          in: 'header',
          required: true,
          description: 'Required for registration/login. Swagger UI supplies this automatically.',
          schema: { type: 'string', enum: ['1'], default: '1' },
        },
        WriteProtection: {
          name: 'X-CSRF-Protection',
          in: 'header',
          required: false,
          description:
            'Required for unauthenticated or cookie-based writes. Swagger UI supplies this automatically.',
          schema: { type: 'string', enum: ['1'], default: '1' },
        },
      },
      responses: {
        Error: {
          description: 'Request rejected or service unavailable. See error.code and error.message.',
          content: json(ref('Error')),
        },
      },
    },
  };
}
