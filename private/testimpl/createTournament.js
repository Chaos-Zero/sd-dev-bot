const { SlashCommandBuilder } = require('discord.js');

const { JsonDatabase } = require('brackets-json-db');
const storage = new JsonDatabase();
const { BracketsManager } = require('brackets-manager');
const manager = new BracketsManager(storage);

module.exports = {
	data: new SlashCommandBuilder()
		.setName('create-bracket')
		.setDescription('Basic Bracket creation'),
	async execute(interaction) {
    await manager.create({
    name: 'Example stage',
    tournamentId: 0, // 


    type: 'single_elimination',
    seeding: [
        'Team 1',
        'Team 2',
        'Team 3',
        'Team 4',
        'Team 5',
        'Team 6',
        'Team 7',
        'Team 8',
    ],
});
		await interaction.reply(manager.get.seeding());
	},
};