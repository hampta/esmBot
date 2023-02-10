import { log } from "../utils/logger.js";

export default async (client, member) => {
    log(`[GUILD MEMBER ADD] ${member.user.username} (${member.user.id}) joined ${member.guild.name} (${member.guild.id}).`);
    // add a role to the member when they join the server
    await member.addRole(process.env.DEFAULT_ROLE_ID);

    // welcome embed message
    const embed = {
        title: `Welcome to ${member.guild.name} server ${member.user.username}!`,
        description: `Please read the rules and enjoy your stay!`,
        color: 0x00ff00,
        thumbnail: {
            url: member.user.avatarURL()
        },
        footer: {
            text: `User ID: ${member.user.id} | ${member.guild.memberCount} members`
        },
        timestamp: new Date().toISOString()
    };
    await client.rest.channels.createMessage(process.env.WELCOME_CHANNEL_ID, { embeds: [embed] });
};