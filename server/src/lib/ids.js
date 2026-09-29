import { isObjectId } from '../../../src/shared/rules.mjs';
import { HttpError } from './util.js';

/** router.param handler: reject malformed :id values with a clear 400. */
export const checkId = (_req, _res, next, id) => (isObjectId(id) ? next() : next(new HttpError(400, 'That id is not valid.')));
