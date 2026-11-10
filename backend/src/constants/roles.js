/**
 * Role constants — canonical values are UPPER-CASE per architecture spec.
 * Lower-case legacy values ('user'/'admin') are accepted on input and
 * normalized to upper-case by the User model setter + authorize middleware.
 */
const ROLES = Object.freeze({
  USER: 'USER',
  ADMIN: 'ADMIN',
});

const ROLE_VALUES = Object.freeze(Object.values(ROLES));

module.exports = { ROLES, ROLE_VALUES };
