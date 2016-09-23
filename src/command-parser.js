/**
 * Command Parser for Showdown ChatBot
 * Showdown ChatBot is distributed under the terms of the MIT License
 * (https://github.com/asanrom/Showdown-ChatBot/blob/master/LICENSE)
 *
 * This file handles with bot commands, the main
 * ineteraction system between the bot and
 * Pokemon Showdown users
 */

'use strict';

const Max_Cmd_Flood = 30;
const Flood_Interval = 45 * 1000;
const Help_Msg_Interval = 2 * 60 * 1000;
const Command_Wait_Interval = 1500;

const Util = require('util');
const Path = require('path');

const DataBase = Tools.get('json-db.js');
const Text = Tools.get('text.js');
const Chat = Tools.get('chat.js');
const AbuseMonitor = Tools.get('abuse-monitor.js');
const LineSplitter = Tools.get('line-splitter.js');

const Translator = Tools.get('translate.js');
const translator = new Translator(Path.resolve(__dirname, 'command-parser.translations'));
const usageTranslator = new Translator(Path.resolve(__dirname, 'command-usage.translations'));

/**
 * Represents a Showdown-ChatBot command parser
 */
class CommandParser {
	/**
	 * @param {Path} path - Existing directory to store the parser configuration
	 * @param {ShowdownBot} bot
	 */
	constructor(path, bot) {
		/* Initial values */
		this.bot = bot;
		this.commands = {};
		this.triggers = {
			before: {},
			after: {},
		};
		this.lastHelpCommand = {};
		this.lastPrivateCommand = {};

		/* Configuration DataBase */
		this.db = new DataBase(Path.resolve(path, 'cmd-parser.json'));
		this.data = this.db.data;
		if (!this.data.aliases) this.data.aliases = {}; /* Command Aliases */
		if (!this.data.exceptions) this.data.exceptions = {}; /* Excepted users */
		if (!this.data.canExceptions) this.data.canExceptions = []; /* Permission exceptions */
		if (!this.data.permissions) this.data.permissions = {}; /* Permission configuration */
		if (!this.data.roompermissions) this.data.roompermissions = {}; /* Permission configuration in rooms */
		if (!this.data.sleep) this.data.sleep = {}; /* Sleeping rooms */
		if (!this.data.roomctrl) this.data.roomctrl = {}; /* Control rooms */
		if (!this.data.helpmsg) this.data.helpmsg = ""; /* Help Message */
		if (!this.data.antispam) this.data.antispam = false; /* Anti-Spam System */

		/* Dynamic Commands */
		if (!this.data.dyncmds) this.data.dyncmds = {};
		if (Object.keys(this.data.dyncmds).length === 0) {
			this.data.dyncmds['help'] = 'https://github.com/asanrom/Showdown-ChatBot/wiki/Commands-List';
		}

		/* Permissions */
		this.modPermissions = {
			wall: {group: 'driver'},
			info: {group: 'voice'},
		};

		/* Abuse Monitor */
		this.monitor = new AbuseMonitor(Max_Cmd_Flood, Flood_Interval);
		this.monitor.on('lock', (user, msg) => {
			App.log("[PARSER - ABUSE] [LOCK: " + user + "]" + msg);
		});
		this.monitor.on('unlock', user => {
			App.log("[PARSER - ABUSE] [UNLOCK: " + user + "]");
		});
	}

	/**
	 * Returns true if the command exists, false if not
	 * @param {String} cmd - Command ID
	 * @returns {Boolean}
	 */
	commandExists(cmd) {
		if (this.commands[cmd] || this.data.dyncmds[cmd]) {
			return true;
		} else {
			return false;
		}
	}

	/**
	 * Inexact search for commands
	 * @param {String} cmd - Inexact command id
	 * @returns {String} Exact command or empty string if not found
	 */
	searchCommand(cmd) {
		if (!cmd) return '';
		let results = [];
		let maxLd = 3;

		if (cmd.length <= 1) {
			return '';
		} else if (cmd.length <= 4) {
			maxLd = 1;
		} else if (cmd.length <= 6) {
			maxLd = 2;
		}

		for (let command in this.commands) {
			let ld = Text.levenshtein(command, cmd, maxLd);
			if (ld <= maxLd) {
				results.push({cmd: command, ld: ld});
			}
		}

		for (let command in this.data.dyncmds) {
			let ld = Text.levenshtein(command, cmd, maxLd);
			if (ld <= maxLd) {
				results.push({cmd: command, ld: ld});
			}
		}

		let currLd = 10;
		let chosen = '';

		for (let i = 0; i < results.length; i++) {
			if (results[i].ld < currLd) {
				currLd = results[i].ld;
				chosen = results[i].cmd;
			}
		}

		return chosen;
	}

	/**
	 * Adds static commands to the command parser
	 * @param {Object} cmds - Object key = command id, value = function or string
	 */
	addCommands(cmds) {
		for (let k in cmds) {
			switch (typeof cmds[k]) {
			case 'function':
				this.commands[k] = new Command(k, cmds[k]);
				break;
			case 'string':
				if (!this.data.aliases[k]) {
					this.data.aliases[k] = cmds[k];
				}
				break;
			}
		}
	}

	/**
	 * Removes static commands (to uninstall an add-on
	 * @param {Object} cmds - Object key = command id, value = function or string
	 */
	removeCommands(cmds) {
		for (let k in cmds) {
			switch (typeof cmds[k]) {
			case 'function':
				if (this.commands[k] && this.commands[k].func === cmds[k]) {
					delete this.commands[k];
				}
				break;
			case 'string':
				if (this.data.aliases[k] && this.data.aliases[k] === cmds[k]) {
					delete this.data.aliases[k];
				}
				break;
			}
		}
	}

	/**
	 * Asynchronous method to write the configuration
	 * to persistent storage
	 */
	saveData() {
		this.db.write();
	}

	/**
	 * Adds a command permission
	 * @param {String} id - Permission ID
	 * @param {Object} attributes - Object with the attributes (execepted, group)
	 */
	addPermission(id, attributes) {
		if (!this.modPermissions[id]) {
			this.modPermissions[id] = attributes;
		}
	}

	/**
	 * Adds a Command parser trigger
	 * @param {String} id - Trigger ID
	 * @param {String} mode - It can be "before" (it can interupt the command) or "after"
	 * @param {function(CommandContext)} func
	 */
	addTrigger(id, mode, func) {
		if (this.triggers[mode]) {
			this.triggers[mode][id] = func;
		}
	}

	/**
	 * Runs the triggers
	 * @param {String} mode - (before/after)
	 * @param {CommandContext} context
	 * @returns {Boolean} true if the trigger interrups the command
	 */
	execTriggers(mode, context) {
		if (this.triggers[mode]) {
			for (let k in this.triggers[mode]) {
				if (this.triggers[mode][k](context) === true) return true;
			}
		}
		return false;
	}

	/**
	 * Removes a trigger
	 * @param {String} id - Trigger ID
	 * @param {String} mode - It can be "before" (it can interupt the command) or "after"
	 */
	removeTrigger(id, mode) {
		if (this.triggers[mode]) {
			delete this.triggers[mode][id];
		}
	}

	/**
	 * Sends a help message
	 * @param {String} userid - User ID
	 * @param {String} by - User name
	 */
	sendHelpMsg(userid, by) {
		for (let user in this.lastHelpCommand) {
			if (Date.now() - this.lastHelpCommand[user] >= Help_Msg_Interval) {
				delete this.lastHelpCommand[user];
			}
		}
		if (this.lastHelpCommand[userid]) return;
		this.lastHelpCommand[userid] = Date.now();
		let helpmsg = this.data.helpmsg;
		helpmsg = helpmsg.replace(/\$USER/, by);
		helpmsg = helpmsg.replace(/\$BOT/, App.bot.getBotNick());
		this.bot.pm(userid, Text.stripCommands(helpmsg));
	}

	/**
	 * Anti Spam System (check method)
	 * @param {String} userid - User ID
	 * @param {String} room - Room where the command is used
	 * @returns {Boolean}
	 */
	checkAntiSpamSystem(userid, room) {
		if (!this.data.antispam) return false;
		if (room && this.bot.rooms[room] && this.bot.rooms[room].type === 'chat') return false; // Public command
		for (let user in this.lastPrivateCommand) {
			if (Date.now() - this.lastPrivateCommand[user] >= Command_Wait_Interval) {
				delete this.lastPrivateCommand[user];
			}
		}
		return !!this.lastPrivateCommand[userid];
	}

	/**
	 * Anti Spam System (set method)
	 * @param {String} userid - User ID
	 * @param {String} room - Room where the command is used
	 */
	markPrivateCommand(userid, room) {
		if (!this.data.antispam) return;
		if (room && this.bot.rooms[room] && this.bot.rooms[room].type === 'chat') return false; // Public command
		this.lastPrivateCommand[userid] = Date.now();
	}

	/**
	 * Runs a dynamic command if it exists
	 * @param {CommandContext} context
	 * @returns {Boolean} true if a command was executed
	 */
	execDyn(context) {
		let cmds = this.data.dyncmds;
		let handler = context.cmd;
		if (!cmds[handler] && this.data.aliases[handler]) {
			handler = this.data.aliases[handler]; /* Parse aliases */
		}
		if (cmds[handler]) {
			let command = new DynamicCommand(handler, cmds[handler]);
			command.exec(context); /* Run command */
			return true;
		}
		return false;
	}

	/**
	 * Runs a static command if it exists
	 * @param {CommandContext} context
	 * @returns {Boolean} true if a command was executed
	 */
	exec(context) {
		let handler = context.cmd;
		if (this.commands[handler]) {
			this.commands[handler].exec(context); /* Run command */
			return true;
		} else if (this.data.aliases[handler]) {
			handler = this.data.aliases[handler]; /* Parse aliases */
			if (this.commands[handler]) {
				this.commands[handler].exec(context); /* Run command */
				return true;
			}
		}
		return false;
	}

	/**
	 * Parses a chat or private message to generate
	 * the command context and run the command
	 * @param {String} msg - Message
	 * @param {String} room - Room ID, null if Private message
	 * @param {String} by - User name
	 */
	parse(msg, room, by) {
		if (!room && msg.substr(0, 8) === '/invite ') {
			return this.parse((App.config.parser.tokens[0] || '') + 'joinroom ' + msg.substr(8), room, by);
		}
		if (msg.substr(0, 6) === '/html ') {
			return this.parse(msg.substr(6), room, by);
		}
		let userid = Text.toId(by);
		if (room && this.data.sleep[room]) return; /* Sleeping room */
		if (!this.data.exceptions[userid] && this.monitor.isLocked(userid)) return; /* User locked */
		if (!this.data.exceptions[userid] && this.checkAntiSpamSystem(userid, room)) return;

		/* Target Room */
		let tarRoom = room;
		let openIndex, closeIndex;
		openIndex = msg.indexOf('[');
		closeIndex = msg.indexOf(']');
		if (openIndex === 0 && closeIndex !== -1 && this.data.exceptions[userid]) {
			tarRoom = Text.toRoomid(msg.substr(1, closeIndex - 1));
			msg = msg.substr(closeIndex + 1);
		} else if (room && this.data.roomctrl[room]) {
			tarRoom = this.data.roomctrl[room]; /* Control room */
		}

		/* Command Token */
		let tokens = App.config.parser.tokens;
		let token = null;
		for (let i = 0; i < tokens.length; i++) {
			if (msg.indexOf(tokens[i]) === 0) {
				token = tokens[i];
				break;
			}
		}

		if (!token) {
			if (!room && this.data.helpmsg) {
				this.sendHelpMsg(Text.toId(by), by); /* Help Message */
			}
			return;
		}

		let aux = msg.substr(token.length);

		/* Command and Arguments */
		let spaceIndex = aux.indexOf(" ");
		let cmd, arg;
		if (spaceIndex === -1) {
			cmd = aux;
			arg = "";
		} else {
			cmd = aux.substr(0, spaceIndex);
			arg = aux.substr(spaceIndex + 1);
		}
		cmd = Text.toCmdid(cmd);

		/* Create Command Context */
		let context = new CommandContext(this, room, by, token, cmd, arg, tarRoom, false);

		/* Exec Command */

		if (this.execTriggers('before', context)) return; /* Trigger interrupted the command */

		try {
			if (!this.exec(context)) { /* Static commands have preference */
				if (this.execDyn(context)) {
					this.monitor.count(userid);
					if (!this.data.exceptions[userid]) this.markPrivateCommand(userid, room);
				} else {
					this.execTriggers('after', context);
				}
			} else {
				this.monitor.count(userid);
				if (!this.data.exceptions[userid]) this.markPrivateCommand(userid, room);
			}
		} catch (err) {
			App.log("[COMMAND CRASH] " + err.code + ":" + err.message + " | " + context.toString() + "\n" + err.stack);
			context.errorReply("The command crashed: " + err.code + " (" + err.message + ")");
		}
	}

	/**
	 * Returns true if a group is equal or higher than another,
	 * returns false if not
	 * @param {Object} ident - An object with "group" attribute
	 * @param {String} group - The group you want to compare to
	 * @returns {Boolean}
	 */
	equalOrHigherGroup(ident, group) {
		let groups = App.config.parser.groups;
		if (group.length > 1) {
			if (group === 'excepted') return false;
			if (group === 'user') return true;
			group = App.config.parser[group];
		}
		let i, j;
		i = groups.indexOf(group);
		j = groups.indexOf(ident.group);
		if (i === -1) {
			return true;
		} else if (j === -1) {
			return false;
		} else {
			return (j >= i);
		}
	}

	/**
	 * Returns true if the user has the permission,
	 * false if not.
	 * @param {Object} ident - Object with "id" and group attributes of the user
	 * @param {String} perm - The permission you want to check
	 * @param {String} room - If it is a room permission, null if it is a global permission
	 * @returns {Boolean}
	 */
	can(ident, perm, room) {
		if (this.data.exceptions[ident.id]) return true;
		for (let i = 0; i < this.data.canExceptions.length; i++) {
			let ex = this.data.canExceptions[i];
			if (ex.user === ident.id && (ex.room === null || ex.room === room) && ex.perm === perm) {
				return true;
			}
		}
		if (room && this.data.roompermissions[room] && this.data.roompermissions[room][perm]) {
			return this.equalOrHigherGroup(ident, this.data.roompermissions[room][perm]);
		} else {
			if (!this.data.permissions[perm]) {
				if (!this.modPermissions[perm]) {
					return false;
				} else {
					if (this.modPermissions[perm].excepted) return false;
					if (this.modPermissions[perm].group) {
						return this.equalOrHigherGroup(ident, this.modPermissions[perm].group);
					}
				}
			} else {
				return this.equalOrHigherGroup(ident, this.data.permissions[perm]);
			}
		}
	}

	/**
	 * Returns true if the user can set the permission
	 * in a room. Returns false if not
	 * @param {Object} ident - Object with "id" and group attributes of the user
	 * @param {String} perm - The permission you want to check
	 * @param {String} room - If it is a room permission, null if it is a global permission
	 * @param {String} tarGroup - The group to set the room permission
	 * @returns {Boolean}
	 */
	canSet(ident, perm, room, tarGroup) {
		if (this.data.exceptions[ident.id]) return true;
		if (!this.can(ident, 'set', room)) return false;
		if (!this.can(ident, perm, room)) return false;
		return this.equalOrHigherGroup(ident, tarGroup);
	}

	/**
	 * Returns an array with all commands ids
	 * @returns {Array<String>}
	 */
	getCommadsArray() {
		let commands = Object.keys(this.commands);
		commands = commands.concat(Object.keys(this.data.dyncmds));
		return commands;
	}
}

/**
 * Represents a static command
 */
class Command {
	/**
	 * @param {String} id - Command ID
	 * @param {function(String, CommandContext)} func
	 */
	constructor(id, func) {
		this.id = id;
		this.func = func;
	}

	/**
	 * Runs The command
	 * @param {CommandContext} context
	 */
	exec(context) {
		context.handler = this.id;
		this.func.call(context, this.id, context);
	}
}

/**
 * Represents a dynamic command
 */
class DynamicCommand {
	/**
	 * @param {String} id - Command ID
	 * @param {Object|String} conf - Dynamic command configuration
	 */
	constructor(id, conf) {
		this.id = id;
		this.conf = conf;
	}

	/**
	 * Runs The command
	 * @param {CommandContext} context
	 */
	exec(context) {
		context.handler = this.id;
		this.execNext(this.conf, context);
	}

	execNext(conf, context) {
		switch (typeof conf) {
		case "string":
			context.restrictReply(Text.stripCommands(conf), 'info');
			break;
		case "object":
			if (context.args.length > 0) {
				let arg = Text.toCmdid(context.args.shift());
				let cmd = context.cmd;
				context.cmd += " " + arg;
				if (conf[arg]) {
					this.execNext(conf[arg], context);
				} else if (Object.keys(conf).length) {
					let spl = new LineSplitter(App.config.bot.maxMessageLength);
					spl.add((arg ? (translator.get(4, context.lang) + ". ") : "") +
						translator.get(5, context.lang) + " " + Chat.bold(cmd) + ":");
					let subCmds = Object.keys(conf);
					for (let i = 0; i < subCmds.length; i++) {
						spl.add(" " + subCmds[i] + (i < (subCmds.length - 1) ? ',' : ''));
					}
					context.errorReply(spl.getLines());
				}
			}
			break;
		}
	}
}

/**
 * Represents the circumstances where a command is executed
 */
class CommandContext {
	/**
	 * @param {CommandParser} parser
	 * @param {String} room - Room id where the message was sent or null if pm
	 * @param {String} by - Name of the user that sent the message
	 * @param {String} token - Command token used to run the command
	 * @param {String} cmd - Command id
	 * @param {String} arg - Command argument
	 * @param {String} targetRoom - Target room (control rooms for example)
	 * @param {Boolean} replyWithWall - true to reply with /announce
	 */
	constructor(parser, room, by, token, cmd, arg, targetRoom, replyWithWall) {
		/* Initial values */
		this.parser = parser;
		this.by = by;
		this.byIdent = Text.parseUserIdent(by);
		this.room = this.targetRoom = room;
		this.token = token;
		this.cmd = cmd;
		this.arg = arg.trim();
		this.args = this.arg.split(',');
		this.wall = !!replyWithWall;

		/* Room type */
		if (room === null) {
			this.isPM = true;
			this.roomType = 'pm';
		} else {
			this.isPM = false;
			let rData = this.parser.bot.rooms[room];
			if (rData) {
				this.roomType = rData.type;
			} else {
				this.roomType = 'unknown';
			}
		}

		/* Target room */
		if (targetRoom) this.targetRoom = targetRoom;

		/* Language */
		this.lang = this.getLanguage();
	}

	/**
	 * Sends something to the showdown server
	 * @param {Array<String>|String} data - Data to be sent
	 * @param {String} room - Room to send the data
	 * @returns {SendManager}
	 */
	send(data, room) {
		if (room === undefined) {
			return this.parser.bot.send(data);
		} else {
			return this.parser.bot.sendTo(room, data);
		}
	}

	/**
	 * Sends a private message
	 * @param {String} to - User to send the message
	 * @param {Array<String>|String} data
	 * @returns {SendManager}
	 */
	sendPM(to, data) {
		return this.parser.bot.pm(to, data);
	}

	/**
	 * Standard reply method
	 * @param {Array<String>|String} msg
	 * @returns {SendManager}
	 */
	reply(msg) {
		if (this.isPM) {
			return this.sendPM(this.byIdent.id, msg);
		} else if (this.wall && this.can('wall', this.room)) {
			return this.wallReply(msg);
		} else {
			return this.send(msg, this.room);
		}
	}

	/**
	 * Replies with /announce
	 * @param {Array<String>|String} msg
	 * @returns {SendManager}
	 */
	wallReply(msg) {
		let roomData = this.parser.bot.rooms[this.room];
		let botid = Text.toId(this.parser.bot.getBotNick());
		if (roomData && roomData.users[botid] && this.parser.equalOrHigherGroup({group: roomData.users[botid]}, 'driver')) {
			if (msg instanceof Array) {
				for (let i = 0; i < msg.length; i++) {
					msg[i] = "/announce " + msg[i];
				}
				return this.send(msg, this.room);
			} else {
				return this.send("/announce " + msg, this.room);
			}
		} else {
			return this.send(msg, this.room);
		}
	}

	/**
	 * Replies via private message
	 * @param {Array<String>|String} msg
	 * @returns {SendManager}
	 */
	pmReply(msg) {
		return this.sendPM(this.byIdent.id, msg);
	}

	/**
	 * Replies standard or via pm depending of a permission
	 * @param {Array<String>|String} msg
	 * @param {String} perm - Permission to check
	 * @returns {SendManager}
	 */
	restrictReply(msg, perm) {
		if (this.can(perm, this.room)) {
			return this.reply(msg);
		} else {
			return this.pmReply(msg);
		}
	}

	/**
	 * Replies with an error message
	 * @param {Array<String>|String} msg
	 * @returns {SendManager}
	 */
	errorReply(msg) {
		this.wall = false;
		this.restrictReply(msg, 'info');
	}

	/**
	 * Checks permission for the current user
	 * @param {String} perm - Permission to check
	 * @param {String} room - Room (a room permission) or null (global permission)
	 */
	can(perm, room) {
		return this.parser.can(this.byIdent, perm, room);
	}

	/**
	 * Replies with an access denied message
	 * @param {String} perm - Permission required to use the command
	 * @returns {SendManager}
	 */
	replyAccessDenied(perm) {
		return this.pmReply(translator.get(0, this.lang) + '. ' +
			translator.get(1, this.lang) + ' ' + Chat.italics(perm) + ' ' + translator.get(2, this.lang) + '.');
	}

	/**
	 * Returns true if the user is excepted, false if not
	 * @returns {Boolean}
	 */
	isExcepted() {
		return this.parser.data.exceptions[this.byIdent.id];
	}

	/**
	 * Returns the room configured language
	 * @returns {String} Room language
	 */
	getLanguage() {
		if (!this.room) {
			return App.config.language['default'];
		} else {
			return App.config.language.rooms[this.room] || App.config.language['default'];
		}
	}

	/**
	 * Returns an usage message
	 * @returns {String} Usage message
	 */
	usage() {
		let txt = "";
		txt += "" + translator.get(3, this.lang) + ": ";
		txt += this.token + this.cmd;
		txt += " ";
		let args = "";
		for (let i = 0; i < arguments.length; i++) {
			if (arguments[i].optional) {
				args += "[" + arguments[i].desc + "]";
			} else {
				args += "<" + arguments[i].desc + ">";
			}
			if (i < arguments.length - 1) args += ", ";
		}
		txt += Chat.italics(args);
		return txt;
	}

	/**
	 * @param {String} key
	 * @returns {String} Translated Key
	 */
	usageTrans(key) {
		return usageTranslator.get(key, this.lang);
	}

	/**
	 * @param {String} room
	 * @returns {String} Room Type
	 */
	getRoomType(room) {
		if (room === null) {
			return 'pm';
		} else {
			let rData = this.parser.bot.rooms[room];
			if (rData) {
				return rData.type;
			} else {
				return 'unknown';
			}
		}
	}

	/**
	 * @returns {Object} Parsed Arguments
	 */
	parseArguments() {
		let parsedArgs = {};
		for (let i = 0; i < this.args.length; i++) {
			let spl = this.args[i].split('=');
			let id = Text.toId(spl[0]);
			let val = (spl[1] || "").trim();
			parsedArgs[id] = val || true;
		}
		return parsedArgs;
	}

	/**
	 * @returns {String}
	 */
	toString() {
		return Util.format("[Room: %s] [By: %s] [Target: %s] [Token: %s] [Cmd: %s] [Arg: %s]",
			this.room, this.by, this.targetRoom, this.token, this.cmd, this.arg);
	}
}

exports.CommandParser = CommandParser;
exports.CommandContext = CommandContext;
exports.Command = Command;
exports.DynamicCommand = DynamicCommand;
