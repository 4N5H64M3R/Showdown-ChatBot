/**
 * Connect Four System
 */

'use strict';

const Text = Tools('text');

class ConnectFourGame {
	constructor(id, room, p1) {
		this.id = id;
		this.room = room;
		this.p1 = p1;
		this.p2 = null;
		this.turn = p1; // p1 starts
		this.status = 'pending'; // pending, active, finished
		this.winner = null;
		
		// 6 rows, 7 columns. 0 = empty, 1 = p1, 2 = p2
		this.board = [];
		for (let r = 0; r < 6; r++) {
			let row = [];
			for (let c = 0; c < 7; c++) {
				row.push(0);
			}
			this.board.push(row);
		}

		this.lastMove = null; // {r, c}
	}

	setPlayer2(user) {
		this.p2 = user;
		this.status = 'active';
	}

	dropToken(col) {
		// Find the lowest empty row in the column
		for (let r = 5; r >= 0; r--) {
			if (this.board[r][col] === 0) {
				this.board[r][col] = (this.turn === this.p1 ? 1 : 2);
				this.lastMove = { r: r, c: col };
				return true;
			}
		}
		return false; // Column full
	}

	switchTurn() {
		this.turn = (this.turn === this.p1 ? this.p2 : this.p1);
	}

	checkWin() {
		const b = this.board;
		const p = (this.turn === this.p1 ? 1 : 2);

		// Horizontal
		for (let r = 0; r < 6; r++) {
			for (let c = 0; c < 4; c++) {
				if (b[r][c] === p && b[r][c+1] === p && b[r][c+2] === p && b[r][c+3] === p) return true;
			}
		}
		// Vertical
		for (let r = 0; r < 3; r++) {
			for (let c = 0; c < 7; c++) {
				if (b[r][c] === p && b[r+1][c] === p && b[r+2][c] === p && b[r+3][c] === p) return true;
			}
		}
		// Diagonal /
		for (let r = 3; r < 6; r++) {
			for (let c = 0; c < 4; c++) {
				if (b[r][c] === p && b[r-1][c+1] === p && b[r-2][c+2] === p && b[r-3][c+3] === p) return true;
			}
		}
		// Diagonal \
		for (let r = 0; r < 3; r++) {
			for (let c = 0; c < 4; c++) {
				if (b[r][c] === p && b[r+1][c+1] === p && b[r+2][c+2] === p && b[r+3][c+3] === p) return true;
			}
		}
		return false;
	}

	checkDraw() {
		for (let c = 0; c < 7; c++) {
			if (this.board[0][c] === 0) return false;
		}
		return true;
	}

	generateHTML(botName) {
		let html = `<div id="c4-board-${this.id}" style="text-align: center; background-color: #f1f1f1; padding: 10px; border-radius: 5px;">`;
		
		// Status Bar
		if (this.status === 'pending') {
			html += `<h3>Waiting for Player 2...</h3>`;
			html += `<button name="send" value="/botmsg ${botName}, .c4 join ${this.id}" style="padding: 5px 10px; cursor: pointer;">Join Game</button>`;
		} else if (this.status === 'finished') {
			if (this.winner) {
				html += `<h3>Winner: <strong style="color: ${this.winner === this.p1 ? 'red' : '#d4ac0d'}">${Text.escapeHTML(this.winner)}</strong></h3>`;
			} else {
				html += `<h3>Draw!</h3>`;
			}
		} else {
			html += `<h3>Turn: <span style="color: ${this.turn === this.p1 ? 'red' : '#d4ac0d'}">${Text.escapeHTML(this.turn)}</span></h3>`;
		}
		
		html += `<table style="margin: 10px auto; background-color: #0055BB; padding: 10px; border-radius: 10px; border-spacing: 5px;">`;

		// Board
		for (let r = 0; r < 6; r++) {
			html += `<tr>`;
			for (let c = 0; c < 7; c++) {
				let cell = this.board[r][c];
				let color = 'white';
				if (cell === 1) color = '#ff4d4d'; // Red
				if (cell === 2) color = '#f1c40f'; // Yellow
				
				html += `<td><div style="width: 40px; height: 40px; border-radius: 50%; background-color: ${color}; box-shadow: inset 2px 2px 5px rgba(0,0,0,0.3);"></div></td>`;
			}
			html += `</tr>`;
		}

		// Controls (only if active)
		if (this.status === 'active') {
			html += `<tr>`;
			for (let c = 0; c < 7; c++) {
				// Check if column is full for visual disabling (logic handled in backend too)
				let disabled = (this.board[0][c] !== 0) ? 'disabled style="background: grey"' : 'style="cursor: pointer"';
				html += `<td><button name="send" value="/botmsg ${botName}, .c4 play ${this.id},${c+1}" ${disabled}>&#9660;</button></td>`;
			}
			html += `</tr>`;
		}

		html += `</table>`;
		html += `<div style="font-size: 10px; margin-top: 5px;">Game ID: ${this.id} | <button name="send" value="/botmsg ${botName}, .c4 refresh ${this.id}">Refresh</button> | <button name="send" value="/botmsg ${botName}, .c4 forfeit ${this.id}">Forfeit</button></div>`;
		html += `</div>`;

		return html;
	}
}

class ConnectFourManager {
	constructor() {
		this.games = {};
	}

	createGame(room, user) {
		let id = 'c4-' + Text.randomToken(4).toLowerCase(); // Example: c4-a1b2
		while (this.games[id]) {
			id = 'c4-' + Text.randomToken(4).toLowerCase();
		}
		this.games[id] = new ConnectFourGame(id, room, user);
		return this.games[id];
	}

	getGame(id) {
		return this.games[id];
	}

	findUserGame(user) {
		// Returns the most recent active game for a user if ID isn't provided
		let keys = Object.keys(this.games);
		for (let i = keys.length - 1; i >= 0; i--) {
			let game = this.games[keys[i]];
			if ((game.p1 === user || game.p2 === user) && game.status !== 'finished') {
				return game;
			}
		}
		return null;
	}

	findOpenGameInRoom(room) {
		let keys = Object.keys(this.games);
		for (let i = keys.length - 1; i >= 0; i--) {
			let game = this.games[keys[i]];
			if (game.room === room && game.status === 'pending') {
				return game;
			}
		}
		return null;
	}

	deleteGame(id) {
		if (this.games[id]) delete this.games[id];
	}
}

module.exports = new ConnectFourManager();
