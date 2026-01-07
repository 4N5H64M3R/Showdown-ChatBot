/**
 * Connect Four Commands
 */

'use strict';

const Path = require('path');
const System = require(Path.resolve(__dirname, 'system.js'));
const Text = Tools('text');

// Helper to send/update the HTML board
function sendBoard(App, user, game) {
	let html = game.generateHTML(App.bot.getBotNick());
	let pageId = `connectfour-${game.id}`;
	App.bot.send(`/sendhtmlpage ${user}, ${pageId}, ${html}`);
}

function updateBoard(App, game) {
	let html = game.generateHTML(App.bot.getBotNick());
	let pageId = `connectfour-${game.id}`;
	let selector = `#c4-board-${game.id}`;
	
	// Update for P1
	if (game.p1) App.bot.send(`/changehtmlpageselector ${game.p1}, ${pageId}, ${selector}, ${html}`);
	// Update for P2
	if (game.p2) App.bot.send(`/changehtmlpageselector ${game.p2}, ${pageId}, ${selector}, ${html}`);
}

module.exports = {
	"c4": "connectfour",
	"connectfour": {
		"start": function (App, context) {
			if (context.roomType !== 'chat') return context.errorReply("This command can only be used in chat rooms.");
			
			const game = System.createGame(context.room, context.by);
			context.sendPM(context.by, `Created Connect Four game [${game.id}]! Waiting for opponent...`);
			
			// Open the HTML window for the creator
			sendBoard(App, context.by, game);

			// Announce in room
			context.reply(`A new Connect Four game has been created by ${context.by}! Use ";c4 join" to play.`);
		},

		"join": function (App, context) {
			let gameId = context.arg.trim();
			let game;

			if (gameId) {
				game = System.getGame(gameId);
			} else {
				// Try to find an open game in this room
				game = System.findOpenGameInRoom(context.room);
			}

			if (!game) return context.errorReply("Could not find a game to join.");
			if (game.status !== 'pending') return context.errorReply("This game is already full or finished.");
			if (game.p1 === context.by) return context.errorReply("You cannot play against yourself!");

			game.setPlayer2(context.by);
			
			context.sendPM(context.by, `You joined the game [${game.id}] vs ${game.p1}!`);
			
			// Open board for P2
			sendBoard(App, context.by, game);
			// Update board for P1 to show game started
			updateBoard(App, game);
		},

		"play": function (App, context) {
			let args = context.arg.split(',');
			let gameId = args[0] ? args[0].trim() : null;
			let colStr = args[1] ? args[1].trim() : null;

			// Handle coordinate input like "c4-ab12, 4"
			let game = System.getGame(gameId);
			if (!game) return context.errorReply("Game not found.");

			if (game.status !== 'active') return context.errorReply("Game is not active.");
			if (game.turn !== context.by) return context.errorReply("It's not your turn!");

			let col = parseInt(colStr);
			if (isNaN(col) || col < 1 || col > 7) return context.errorReply("Invalid column. Please choose 1-7.");

			// Logic uses 0-6
			let success = game.dropToken(col - 1);
			if (!success) return context.errorReply("That column is full!");

			// Check win
			if (game.checkWin()) {
				game.status = 'finished';
				game.winner = context.by;
				updateBoard(App, game);
				// Announce result
				if (game.room) App.bot.sendTo(game.room, `Connect Four [${game.id}]: ${context.by} def. ${game.turn === game.p1 ? game.p2 : game.p1}!`);
				return;
			}

			// Check draw
			if (game.checkDraw()) {
				game.status = 'finished';
				updateBoard(App, game);
				if (game.room) App.bot.sendTo(game.room, `Connect Four [${game.id}]: Game ended in a draw.`);
				return;
			}

			game.switchTurn();
			updateBoard(App, game);
		},

		"refresh": function (App, context) {
			let gameId = context.arg.trim();
			
			if (gameId) {
				let game = System.getGame(gameId);
				if (game) {
					sendBoard(App, context.by, game);
					App.bot.send(`/highlighthtmlpage ${context.by}, connectfour-${game.id}, Game Refreshed`);
				} else {
					context.errorReply("Game not found.");
				}
			} else {
				// Refresh all active games for user
				let keys = Object.keys(System.games);
				let found = false;
				for (let key of keys) {
					let game = System.games[key];
					if (game.p1 === context.by || game.p2 === context.by) {
						sendBoard(App, context.by, game);
						found = true;
					}
				}
				if (found) {
					context.pmReply("Refreshed your active games.");
				} else {
					context.errorReply("You have no active games.");
				}
			}
		},

		"end": function (App, context) {
			let gameId = context.arg.trim();
			if (!gameId) return context.errorReply("Please specify a game ID.");
			
			let game = System.getGame(gameId);
			if (!game) return context.errorReply("Game not found.");

			// Permission check: Players or Room Drivers+
			let canEnd = (game.p1 === context.by || game.p2 === context.by || context.can('driver', game.room));
			
			if (!canEnd) return context.errorReply("Access denied.");

			game.status = 'finished';
			updateBoard(App, game);
			System.deleteGame(gameId);
			context.reply(`Game [${gameId}] has been ended.`);
		},

		"forfeit": function (App, context) {
			let gameId = context.arg.trim();
			let game = gameId ? System.getGame(gameId) : System.findUserGame(context.by);
			
			if (!game) return context.errorReply("Game not found.");
			if (game.status !== 'active') return context.errorReply("Game is not active.");
			if (game.p1 !== context.by && game.p2 !== context.by) return context.errorReply("You are not in this game.");

			game.status = 'finished';
			game.winner = (context.by === game.p1 ? game.p2 : game.p1);
			updateBoard(App, game);
			
			if (game.room) App.bot.sendTo(game.room, `Connect Four [${game.id}]: ${context.by} forfeited against ${game.winner}.`);
		}
	}
};
