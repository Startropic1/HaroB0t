const config = require('../config.js')
const log = require('../util/logger.js')
const MenuUtils = require('../structs/MenuUtils.js')
const moment = require('moment')
const dbOps = require('../util/dbOps.js')
const serverLimit = require('../util/serverLimit.js')
const FAIL_LIMIT = config.feeds.failLimit

module.exports = async (bot, message, command) => {
  try {
    const [ guildRss, serverLimitData ] = await Promise.all([ dbOps.guildRss.get(message.guild.id), serverLimit(message.guild.id) ])
    if (!guildRss || !guildRss.sources || Object.keys(guildRss.sources).length === 0) return await message.channel.send('There are no existing feeds.')

    const failedLinks = {}
    const rssList = guildRss.sources
    let failedFeedCount = 0

    const vipUser = serverLimitData.vipUser
    const maxFeedsAllowed = serverLimitData.max

    const refreshRate = vipUser && !vipUser.invalid && (vipUser.pledged >= 500 || vipUser.override === true) ? config._vipRefreshTimeMinutes : config.feeds.refreshTimeMinutes
    // Generate the info for each feed as an array, and push into another array
    const currentRSSList = []
    const failedLinksToCheck = []
    for (const rssName in rssList) {
      const feed = rssList[rssName]
      let o = {
        link: feed.link,
        title: feed.title,
        webhook: feed.webhook ? feed.webhook.id : undefined,
        channel: bot.channels.get(feed.channel) ? bot.channels.get(feed.channel).name : undefined,
        titleChecks: feed.titleChecks === true ? 'Title Checks: Enabled\n' : null
      }
      failedLinksToCheck.push(feed.link)
      if (feed.disabled) o.status = `Status: DISABLED (${feed.disabled})\n`
      currentRSSList.push(o)
    }
    const results = await dbOps.failedLinks.getMultiple(failedLinksToCheck)
    for (const result of results) failedLinks[result.link] = result.failed || result.count
    if (FAIL_LIMIT !== 0) {
      for (const feed of currentRSSList) {
        if (feed.status && feed.status === `Status: DISABLED\n`) continue
        const failCount = failedLinks[feed.link]
        feed.status = !failCount || (typeof failCount === 'number' && failCount <= FAIL_LIMIT) ? `Status: OK ${failCount > Math.ceil(FAIL_LIMIT / 5) ? '(failed ' + failCount + '/' + FAIL_LIMIT + ' times)' : ''}\n` : 'Status: FAILED\n'
        if (feed.status.startsWith('Status: FAILED')) ++failedFeedCount
      }
    }

    let vipDetails = ''
    if (vipUser) {
      vipDetails += '**Patron Until:** '
      if (vipUser.expireAt) {
        const expireAt = moment(vipUser.expireAt)
        const daysLeft = Math.round(moment.duration(expireAt.diff(moment())).asDays())
        vipDetails += `${expireAt.format('D MMMM YYYY')} (${daysLeft} days)\n`
      } else vipDetails += 'Ongoing\n'
    } else vipDetails = '\n'

    let desc = maxFeedsAllowed === 0 ? `${vipDetails}**Refresh Rate:** ${refreshRate} minutes\n\u200b\n` : `${vipDetails}**Server Limit:** ${Object.keys(rssList).length}/${maxFeedsAllowed} [＋](https://www.patreon.com/discordrss)\n**Refresh Rate:** ${refreshRate} minutes [－](https://www.patreon.com/discordrss)\n\u200b\n`
    desc += failedFeedCount > 0 ? `**Attention!** Feeds that have reached ${FAIL_LIMIT} connection failure limit have been detected. They will no longer be retried until the bot instance is restarted. Please either remove, or use **${guildRss.prefix || config.bot.prefix}rssrefresh** to try to reset its status.\u200b\n\u200b\n` : ''

    const list = new MenuUtils.Menu(message)
      .setAuthor('Current Active Feeds')
      .setDescription(desc)

    if (vipUser) list.setFooter(`Patronage backed by ${vipUser.name} (${vipUser.id})`)

    currentRSSList.forEach(item => {
      const link = item.link
      const title = item.title
      const channelName = item.channel
      const status = item.status
      const titleChecks = item.titleChecks
      const webhook = item.webhook

      list.addOption(`${title.length > 200 ? title.slice(0, 200) + '[...]' : title}`, `${titleChecks || ''}${status || ''}Channel: #${channelName}\n${webhook ? 'Webhook: ' + webhook + '\n' : ''}Link: ${link.length > 500 ? '*Exceeds 500 characters*' : link}`)
    })

    await list.send()
  } catch (err) {
    log.command.warning(`rsslist`, message.guild, err)
    if (err.code !== 50013) message.channel.send(err.message).catch(err => log.command.warning('rsslist 1', message.guild, err))
  }
}
