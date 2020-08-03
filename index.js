const Discord = require('discord.js');
const DiscordRSS = require('discord.rss');
const config = require("./config.js");
const bot = new Discord.Client();
const drss = new DiscordRSS.Client();

drss.login(bot);
bot.login(config.token);