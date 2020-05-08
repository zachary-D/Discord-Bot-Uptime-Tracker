import * as Discord from "discord.js";

import { client } from "../Discord-Bot-Core/bot";

const NOTIFY_ROLE_NAME = "notifications";
const NOTIFY_CHANNEL_NAME = "bot-status-updates";

const guildMonitors = new Discord.Collection<Discord.Snowflake, GuildMonitor>();

class GuildMonitor {
	private guild: Discord.Guild;
	private notificationRole: Discord.Role;
	private notificationChannel: Discord.TextChannel;

	//Stores the previous state of the bot
	private wasBotOffline = new Discord.Collection<Discord.Snowflake, boolean>();

	private startupPromises: Promise<any>[];

	private constructor(guild: Discord.Guild) {
		this.guild = guild;
		this.locateOrCreateGuildObjects();

		for(const [id, member] of this.guild.members.filter(mem => mem.user.bot)) {
			this.wasBotOffline.set(id, member.presence.status === "offline");
		}
	}

	static createNewGuildMonitor(guild: Discord.Guild) {
		const monitor = new GuildMonitor(guild);
		guildMonitors.set(guild.id, monitor);
	}

	async handleMemberPresenceChange(member: Discord.GuildMember) {
		if(!member.user.bot) return;

		await Promise.all(this.startupPromises);

		let status: string;
		if(member.presence.status === "offline") status = "offline";
		else status = "online";

		if(status == "online" && !this.wasBotOffline.get(member.id)) return;

		this.wasBotOffline.set(member.id, member.presence.status === "offline");

		this.notificationChannel.send(`${this.notificationRole}, ${member} is ${status}`);
	}

	//Sends notifications for any members that are offline
	async sendNotificationsForAllOfflineBots() {
		this.guild.members
		.filter(mem => mem.user.bot)
		.filter(mem => mem.presence.status === "offline")
		.forEach(mem => this.handleMemberPresenceChange(mem));
	}

	//Finds or creates the channels and roles for the server
	private async locateOrCreateGuildObjects() {
		this.startupPromises = [
			this.locateOrCreateNotificationRole(),
			this.locateOrCreateNotificationChannel()
		]
	}

	private async locateOrCreateNotificationRole() {
		this.notificationRole = this.guild.roles.find(r => r.name === NOTIFY_ROLE_NAME);
		if(!this.notificationRole) this.notificationRole = await this.guild.createRole({name: NOTIFY_ROLE_NAME, mentionable: true});
	}

	private async locateOrCreateNotificationChannel() {
		this.notificationChannel = this.guild.channels.find(ch => ch.name === NOTIFY_CHANNEL_NAME) as Discord.TextChannel;
		if(!this.notificationChannel) this.notificationChannel = await this.guild.createChannel(NOTIFY_CHANNEL_NAME, {type: "text"}) as Discord.TextChannel;
	}
}

let firstStartup = true;

client.on("ready", () => {
	if(firstStartup) {
		firstStartup = false;
		for(const [id, guild] of client.guilds) {
			GuildMonitor.createNewGuildMonitor(guild);
		}
	}

	for(const [id, monitor] of guildMonitors) {
		monitor.sendNotificationsForAllOfflineBots();
	}
});

client.on("presenceUpdate", (oldMember: Discord.GuildMember, newMember: Discord.GuildMember) => {
	guildMonitors.get(newMember.guild.id).handleMemberPresenceChange(newMember);
});