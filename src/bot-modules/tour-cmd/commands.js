/**
 * Commands File
 *
 * tour: creates a tournament easier than using Showdown commands
 */

'use strict';

const Path = require('path');
const Text = Tools('text');
const Chat = Tools('chat');
const Inexact = Tools('inexact-pokemon');

const Lang_File = Path.resolve(__dirname, 'commands.translations');
const TourTypes = { "elimination": 1, "roundrobin": 1, "rr": 1, "elim": 1 };

function parseAliases(format, App) {
	const Config = App.config.modules.tourcmd;
	format = Text.toId(format);
	if (App.bot.formats[format]) return format;
	for (let gen = 9; gen > 0; gen--) {
		if (App.bot.formats["gen" + gen + format]) return "gen" + gen + format;
	}
	let aliases = Config.aliases;
	if (aliases[format]) format = Text.toId(aliases[format]);
	if (App.bot.formats[format]) return format;
	try {
		let aliases = App.data.getAliases();
		if (aliases[format]) format = Text.toId(aliases[format]);
	} catch (err) {
		App.log("Could not fetch aliases. ERROR: " + err.message);
	}
	if (App.bot.formats[format]) return format;
	return Text.toFormatStandard(format);
}

function botCanHtml(room, App) {
	let roomData = App.bot.rooms[room];
	let botid = Text.toId(App.bot.getBotNick());
	return (roomData && roomData.users[botid] && App.parser.equalOrHigherGroup({ group: roomData.users[botid] }, 'bot'));
}

module.exports = {
	newtour: 'tour',
	tour: function (App) {
		this.setLangFile(Lang_File);
		if (!this.can('tour', this.room)) return this.replyAccessDenied('tour');
		if (!this.arg) {
			return this.errorReply(this.usage(
				{ desc: this.usageTrans('format') },
				{ desc: 'type=' + 'elim|rr|double-elim|double-rr', optional: true },
				{ desc: 'auto-start=' + this.mlt('autostart'), optional: true },
				{ desc: 'dq=' + this.mlt('autodq'), optional: true },
				{ desc: 'users=' + this.mlt('maxusers'), optional: true },
				{ desc: 'rounds=' + this.mlt('rounds'), optional: true },
				{ desc: 'name=' + this.mlt('name'), optional: true },
				{ desc: 'rules=' + this.mlt('rules'), optional: true }
			));
		}
		const Mod = App.modules.tourcmd.system;
		const Config = App.config.modules.tourcmd;
		if (this.getRoomType(this.room) !== 'chat') {
			return this.errorReply(this.mlt('nochat'));
		}
		if (Mod.tourData[this.room]) {
			if (Text.toId(this.arg) === 'start' && !Mod.tourData[this.room].isStarted) {
				return this.send('/tournament start', this.room);
			}
			return this.errorReply(this.mlt('e2'));
		}
		let details = {
			format: Config.format,
			type: Config.type,
			maxUsers: Config.maxUsers || null,
			timeToStart: Config.time,
			autodq: Config.autodq,
			scoutProtect: Config.scoutProtect,
			forcedTimer: Config.forcedTimer,
			rounds: null,
			rules: null,
			name: null,
		};
		if (this.arg && this.arg.length) {
			let args = this.args;
			let params = {
				format: null,
				type: null,
				maxUsers: null,
				timeToStart: null,
				autodq: null,
				scout: null,
				timer: null,
				rules: "",
				name: null,
			};
			let splArg;
			let isRules = false;
			for (let i = 0; i < args.length; i++) {
				args[i] = args[i].trim();
				if (!args[i]) continue;
				splArg = args[i].split("=");
				if (i > 0 && isRules && splArg.length < 2) {
					params.rules += "," + args[i];
				} else if (i > 0 && splArg.length < 2 && Text.toId(args[i]) in TourTypes) {
					params.type = args[i];
					isRules = false;
				} else if (splArg.length < 2) {
					switch (i) {
						case 0:
							params.format = args[i];
							break;
						case 1:
							params.type = args[i];
							break;
						case 2:
							params.timeToStart = args[i];
							break;
						case 3:
							params.autodq = args[i];
							break;
						case 4:
							params.maxUsers = args[i];
							break;
					}
				} else {
					let idArg = Text.toId(splArg[0]);
					let valueArg = splArg.slice(1).join("=").trim();
					switch (idArg) {
						case 'format':
						case 'tier':
							params.format = valueArg;
							break;
						case 'singups':
						case 'start':
						case 'autostart':
							params.timeToStart = valueArg;
							break;
						case 'autodq':
						case 'dq':
							params.autodq = valueArg;
							break;
						case 'maxusers':
						case 'users':
							params.maxUsers = valueArg;
							break;
						case 'rounds':
							params.rounds = valueArg;
							break;
						case 'generator':
						case 'type':
							params.type = valueArg;
							break;
						case 'scouting':
						case 'scout':
						case 'setscout':
						case 'setscouting':
							params.scout = valueArg;
							break;
						case 'timer':
						case 'forcetimer':
							params.timer = valueArg;
							break;
						case 'name':
							params.name = valueArg;
							break;
						case 'rule':
						case 'rules':
						case 'customrules':
							if (params.rules) {
								params.rules += ',' + valueArg;
							} else {
								params.rules = valueArg;
							}
							isRules = true;
							break;
						default:
							if (isRules) {
								if (params.rules) {
									params.rules += ',' + args[i];
								} else {
									params.rules = args[i];
								}
							} else {
								return this.reply(this.mlt('param') + ' ' + idArg + ' ' +
									this.mlt('paramhelp') + ": tier, autostart, dq, users, rounds, type, scout, timer");
							}
					}
				}
			}
			if (params.format) {
				let formatOptions = (params.format + "").split("|").filter(a => {
					return !!(a.trim());
				});
				if (formatOptions.length > 0) {
					const parsedFormats = [];
					for (let formatOption of formatOptions) {
						let format = parseAliases(formatOption, App);
						if (!App.bot.formats[format]) {
							let inexact = Inexact.safeResolve(App, format, { formats: 1, others: 0 });
							return this.reply(this.mlt('e31') + ' "' + format + '" ' + this.mlt('e33') +
								(inexact ? (". " + this.mlt('inexact') + " " + Chat.italics(inexact) + "?") : ""));
						}
						if (App.bot.formats[format].disableTournaments) {
							return this.reply(this.mlt('e31') + ' ' + Chat.italics(App.bot.formats[format].name) +
								' ' + this.mlt('e32'));
						}

						parsedFormats.push(format);
					}

					details.format = parsedFormats[Math.floor(Math.random() * parsedFormats.length)];
				}
			}
			if (params.timeToStart) {
				if (Text.toId(params.timeToStart) === 'off' || Text.toId(params.timeToStart) === 'infinite') {
					details.timeToStart = null;
				} else {
					let time = parseFloat(params.timeToStart);
					if (!time || time < 0.1) return this.reply(this.mlt('e4'));
					details.timeToStart = Math.floor(time * 60) * 1000;
				}
			}
			if (params.autodq) {
				if (Text.toId(params.autodq) === 'off') {
					details.autodq = false;
				} else {
					let dq = parseFloat(params.autodq);
					if (!dq || dq < 0) return this.reply(this.mlt('e5'));
					details.autodq = dq;
				}
			}
			if (params.maxUsers) {
				if (Text.toId(params.maxUsers) === 'off' || Text.toId(params.maxUsers) === 'infinite') {
					details.maxUsers = null;
				} else {
					let musers = parseInt(params.maxUsers);
					if (!musers || musers < 4) return this.reply(this.mlt('e6'));
					details.maxUsers = musers;
				}
			}
			if (params.rounds) {
				if (Text.toId(params.rounds) === 'off') {
					details.rounds = null;
				} else {
					let rounds = parseInt(params.rounds);
					if (!rounds || rounds < 1) {
						rounds = null;
					}
					details.rounds = rounds;
				}
			}
			if (params.type) {
				let type = Text.toId(params.type);
				switch (type) {
					case "doubleelimination":
					case "doubleelim":
					case "de":
						type = "elimination";
						details.rounds = 2;
						break;
					case "doubleroundrobin":
					case "doublerr":
					case "drr":
						type = "roundrobin";
						details.rounds = 2;
						break;
				}
				if (!(type in TourTypes)) {
					return this.reply(this.mlt('e7'));
				}
				details.type = type;
			}
			if (params.scout) {
				let scout = Text.toId(params.scout);
				if (scout in { 'yes': 1, 'on': 1, 'true': 1, 'allow': 1, 'allowed': 1 }) {
					details.scoutProtect = false;
				} else {
					details.scoutProtect = true;
				}
			}
			if (params.timer) {
				let timer = Text.toId(params.timer);
				if (timer in { 'yes': 1, 'on': 1, 'true': 1, 'forced': 1 }) {
					details.forcedTimer = true;
				} else {
					details.forcedTimer = false;
				}
			}
			if (params.name) {
				details.name = params.name;
			}
			if (params.rules) {
				details.rules = params.rules;
			}
		}
		Mod.newTour(this.room, details);
	},

	recentrours: "tourlog",
	tourlog: function (App) {
		this.setLangFile(Lang_File);

		const room = this.parseRoomAliases(Text.toRoomid(this.arg)) || this.room;

		if (!room) {
			return this.errorReply(this.usage({ desc: this.usageTrans('room') }));
		}

		if (!App.bot.rooms[room] || App.bot.rooms[room].type !== 'chat') {
			if (!this.arg) {
				return this.errorReply(this.usage({ desc: this.usageTrans('room') }));
			} else {
				return this.errorReply(this.mlt("room") + " '" + room + "' " + this.mlt("nf"));
			}
		}

		let privates = (App.config.modules.core.privaterooms || []);

		if (room !== this.room && privates.indexOf(room) >= 0) {
			// Private room
			return this.errorReply(this.mlt("room") + " '" + room + "' " + this.mlt("nf"));
		}

		const Mod = App.modules.tourcmd.system;
		const log = Mod.getTournamentLog(room);

		if (log.length === 0) {
			return this.errorReply(this.mlt("logempty"));
		}

		const parsedLog = [];

		for (let l of log) {
			let time = Math.max(1, Math.round((Date.now() - l.time) / 1000));

			let times = [];
			let aux;
			/* Get Time difference */
			aux = time % 60; // Seconds
			if (aux > 0 || time === 0) times.unshift(aux + ' ' + (aux === 1 ? this.mlt(2) : this.mlt(3)));
			time = Math.floor(time / 60);
			aux = time % 60; // Minutes
			if (aux > 0) times.unshift(aux + ' ' + (aux === 1 ? this.mlt(4) : this.mlt(5)));
			time = Math.floor(time / 60);
			aux = time % 24; // Hours
			if (aux > 0) times.unshift(aux + ' ' + (aux === 1 ? this.mlt(6) : this.mlt(7)));
			time = Math.floor(time / 24); // Days
			if (time > 0) times.unshift(time + ' ' + (time === 1 ? this.mlt(8) : this.mlt(9)));

			parsedLog.push({
				timeStr: (this.mlt("agob") + " " + times.join(', ') + " " + this.mlt("ago")).trim(),
				winner: l.winner,
				generator: l.generator,
				format: l.format,
			});
		}

		if (this.can('tourlog', this.room) && botCanHtml(this.room, App)) {
			// HTML

			let html = '';

			html += '<h3 style="text-align:center;">' + Text.escapeHTML(this.mlt('rtours') + " " + this.parser.getRoomTitle(room)) + '</h3>';

			html += '<div style="overflow: auto; height: 120px; width: 100%;">';

			html += '<table border="1" cellspacing="0" cellpadding="3" style="min-width:100%;">';

			html += '<tr>';
			html += '<th>' + Text.escapeHTML(this.mlt("format")) + '</th>';
			html += '<th>' + Text.escapeHTML(this.mlt("type")) + '</th>';
			html += '<th>' + Text.escapeHTML(this.mlt("winner")) + '</th>';
			html += '<th>' + Text.escapeHTML(this.mlt("finish")) + '</th>';
			html += '</tr>';

			for (let l of parsedLog) {
				html += '<tr>';

				html += '<td><b>' + Text.escapeHTML(l.format) + '</b></td>';

				html += '<td>' + Text.escapeHTML(l.generator) + '</td>';

				html += '<td>' + Text.escapeHTML(l.winner) + '</td>';

				html += '<td>' + Text.escapeHTML(l.timeStr) + '</td>';

				html += '</tr>';
			}

			html += '</table>';

			html += '</div>';

			this.send("/addhtmlbox " + html, this.room);
		} else {
			// !code

			let txt = this.mlt('rtours') + " " + this.parser.getRoomTitle(room) + ":\n\n";

			for (let l of parsedLog) {
				txt += "  - " + l.timeStr + " / " + this.mlt("format") + ": " + l.format + " / " + this.mlt("type") + ": " + l.generator + " / " + this.mlt("winner") + ": " + l.winner + "\n";
			}

			this.restrictReply("!code " + txt, 'tourlog');
		}
	},
};
