/**
 * Connect Four Game Module
 */

'use strict';

const Path = require('path');

exports.id = 'connect-four';
exports.name = 'Connect Four';
exports.description = 'Classic Connect Four board game';

exports.commands = require(Path.resolve(__dirname, 'commands.js'));
exports.system = require(Path.resolve(__dirname, 'system.js'));
