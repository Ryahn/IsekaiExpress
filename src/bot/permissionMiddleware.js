async function checkCommandPermissions(client, interaction, commandName) {
  const hash = crypto.createHash('md5').update(commandName).digest('hex');
  const allowedChannel = await client.db.getAllowedChannel(hash);
  
  // If command can be used anywhere or in the current channel
  if (!allowedChannel || allowedChannel.channel_id === 'all' || 
      allowedChannel.channel_id === interaction.channel.id) {
    return true;
  }
  
  // Check if user has override permissions
  const member = interaction.member;
  const hasOverrideRole = member.roles.cache.some(role => 
    client.allowed.includes(role.id)
  );
  
  if (!hasOverrideRole) {
    await interaction.reply({ 
      content: `This command is not allowed in this channel. Please use in <#${allowedChannel.channel_id}>`, 
      ephemeral: true 
    });
    return false;
  }
  
  return true;
}

module.exports = { checkCommandPermissions };
