const fs = require("fs")
const path = require("path")
const crypto = require("crypto")
const request = require("request")
const { Builder, By, Key, until } = require("selenium-webdriver")
const chrome = require("selenium-webdriver/chrome")
const proxy = require("selenium-webdriver/proxy")
const proxyChain = require("proxy-chain")
require('console-stamp')(console, {
  format: ':date(yyyy/mm/dd HH:MM:ss.l)'
})

// 加载环境变量
require("dotenv").config()

// 设置 ChromeDriver
require("chromedriver")

const CRX_URL = "https://clients2.google.com/service/update2/crx?response=redirect&acceptformat=crx2,crx3&prodversion=112&x=id%3D${extensionId}%26installsource%3Dondemand%26uc"
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Safari/537.36"

const extensionId = "caacbgbklghmpodbdafajbgdnegacfmo"
const USER = process.env.APP_USER || ""
const PASSWORD = process.env.APP_PASS || ""
const ALLOW_DEBUG = !!process.env.DEBUG?.length || false
const EXTENSION_FILENAME = "app.crx"
const PROXY = process.env.PROXY || undefined

// 添加启动横幅
console.log("\n")
console.log("========================================================")
console.log("                Gradient Network Bot")
console.log("--------------------------------------------------------")
console.log("  开发者: 小林 (@yoyomyoyoa)")
console.log("--------------------------------------------------------")
console.log("  免责声明:")
console.log("  1. 本项目仅供学习交流使用")
console.log("  2. 使用本项目产生的任何后果由使用者自行承担")
console.log("  3. 请遵守相关法律法规，不要滥用")
console.log("========================================================")
console.log("\n")

console.log("-> 程序启动中...")
console.log("-> 账号:", USER)
console.log("-> 密码:", PASSWORD)
console.log("-> 代理:", PROXY)
console.log("-> 调试模式:", ALLOW_DEBUG ? "开启" : "关闭")

if (!USER || !PASSWORD) {
  console.error("请设置环境变量 APP_USER 和 APP_PASS")
  process.exit(1)
}

if (ALLOW_DEBUG) {
  console.log(
    "-> 调试模式已开启！将在出错时生成截图和控制台日志！"
  )
}

async function downloadExtension(extensionId) {
  const url = CRX_URL.replace("${extensionId}", extensionId)
  const headers = { 
    "User-Agent": USER_AGENT,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1"
  }

  console.log("-> 正在下载扩展，地址:", url)

  // 强制重新下载扩展
  if (fs.existsSync(EXTENSION_FILENAME)) {
    console.log("-> 删除旧的扩展文件...")
    fs.unlinkSync(EXTENSION_FILENAME)
  }

  return new Promise((resolve, reject) => {
    request({ url, headers, encoding: null }, (error, response, body) => {
      if (error) {
        console.error("-> 下载扩展时出错:", error)
        return reject(error)
      }
      if (response.statusCode !== 200) {
        console.error("-> 下载扩展失败！状态码:", response.statusCode)
        return reject(new Error(`下载扩展失败！状态码: ${response.statusCode}`))
      }
      fs.writeFileSync(EXTENSION_FILENAME, body)
      if (ALLOW_DEBUG) {
        const sha256 = crypto.createHash("sha256").update(body).digest("hex")
        console.log("-> 扩展 SHA256:", sha256)
      }
      console.log("-> 扩展下载成功！")
      resolve()
    })
  })
}

async function takeScreenshot(driver, filename) {
  // if ALLOW_DEBUG is set, taking screenshot
  if (!ALLOW_DEBUG) {
    return
  }

  const data = await driver.takeScreenshot()
  fs.writeFileSync(filename, Buffer.from(data, "base64"))
}

async function generateErrorReport(driver) {
  //write dom
  const dom = await driver.findElement(By.css("html")).getAttribute("outerHTML")
  fs.writeFileSync("error.html", dom)

  await takeScreenshot(driver, "error.png")

  const logs = await driver.manage().logs().get("browser")
  fs.writeFileSync(
    "error.log",
    logs.map((log) => `${log.level.name}: ${log.message}`).join("\n")
  )
}

// 检查 Chrome 路径
const CHROME_PATHS = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  process.env.CHROME_PATH
].filter(Boolean)

async function findChromePath() {
  for (const path of CHROME_PATHS) {
    if (fs.existsSync(path)) {
      console.log("-> Chrome 路径:", path)
      return path
    }
  }
  throw new Error("未找到 Chrome 浏览器！请安装 Chrome 浏览器或设置 CHROME_PATH 环境变量。")
}

async function testProxy(proxyUrl) {
  console.log("-> 正在测试代理连接...", proxyUrl)
  
  return new Promise((resolve, reject) => {
    const options = {
      url: 'https://api.ipify.org?format=json',
      proxy: proxyUrl,
      timeout: 10000,
      headers: {
        'User-Agent': USER_AGENT
      }
    }

    request(options, (error, response, body) => {
      if (error) {
        console.error("-> 代理测试失败:", error.message)
        return reject(error)
      }
      
      if (response.statusCode !== 200) {
        console.error("-> 代理测试失败! 状态码:", response.statusCode)
        return reject(new Error(`代理测试失败! 状态码: ${response.statusCode}`))
      }

      try {
        const data = JSON.parse(body)
        console.log("-> 代理测试成功! IP:", data.ip)
        resolve(data.ip)
      } catch (e) {
        console.error("-> 代理测试失败! 无法解析响应:", body)
        reject(e)
      }
    })
  })
}

async function convertProxyUrl(proxyUrl) {
  console.log("-> 正在转换代理地址...")
  try {
    const url = new URL(proxyUrl)
    const protocol = url.protocol.replace(':', '')
    const username = url.username
    const password = url.password
    const host = url.hostname
    const port = url.port

    // 如果是 socks5 代理，尝试转换为 http
    if (protocol === 'socks5') {
      console.log("-> 检测到 SOCKS5 代理，尝试转换为 HTTP...")
      const httpProxy = `http://${username}:${password}@${host}:${port}`
      console.log("-> 转换后的代理地址:", httpProxy)
      return httpProxy
    }
    
    return proxyUrl
  } catch (error) {
    console.error("-> 代理地址转换失败:", error.message)
    return proxyUrl
  }
}

async function startBrowser() {
  console.log("-> 正在启动浏览器...")
  console.log("-> 浏览器启动配置:")
  console.log("   - 无头模式: 开启")
  console.log("   - 窗口大小: 1920x1080")
  console.log("   - 禁用GPU: 是")
  console.log("   - 禁用扩展: 否")

  const chromePath = await findChromePath()
  
  const options = new chrome.Options()
    .setChromeBinaryPath(chromePath)
    .addArguments('--headless=new')
    .addArguments('--no-sandbox')
    .addArguments('--disable-dev-shm-usage')
    .addArguments('--disable-gpu')
    .addArguments('--window-size=1920,1080')
    .addArguments(`--user-agent=${USER_AGENT}`)
    .addArguments('--disable-web-security')
    .addArguments('--ignore-certificate-errors')
    .addArguments('--dns-prefetch-disable')
    .addArguments('--disable-features=IsolateOrigins,site-per-process')

  if (PROXY) {
    console.log("-> 正在设置代理...", PROXY)
    
    // 转换代理地址
    const convertedProxy = await convertProxyUrl(PROXY)
    
    // 先测试代理
    try {
      await testProxy(convertedProxy)
    } catch (error) {
      console.error("-> 代理不可用，程序退出")
      throw new Error("代理连接测试失败，请检查代理配置或更换代理")
    }

    const newProxyUrl = await proxyChain.anonymizeProxy(convertedProxy)
    console.log("-> 新代理地址:", newProxyUrl)
    const proxyUrl = new URL(newProxyUrl)
    console.log("-> 代理主机:", proxyUrl.hostname)
    console.log("-> 代理端口:", proxyUrl.port)
    
    // 设置 Chrome 代理
    options.addArguments(`--proxy-server=${proxyUrl.protocol}//${proxyUrl.hostname}:${proxyUrl.port}`)
    
    // 添加代理认证信息
    if (proxyUrl.username && proxyUrl.password) {
      options.addArguments(`--proxy-auth=${proxyUrl.username}:${proxyUrl.password}`)
    }

    // 添加代理相关参数
    options.addArguments('--proxy-bypass-list=<-loopback>')
    options.addArguments('--host-resolver-rules="MAP * ~NOTFOUND , EXCLUDE localhost"')
    
    console.log("-> 代理设置完成！")
  } else {
    console.log("-> 未设置代理！")
  }

  // 添加扩展
  options.addExtensions(path.resolve(__dirname, EXTENSION_FILENAME))
  console.log("-> 扩展已添加！", EXTENSION_FILENAME)

  try {
    const driver = await new Builder()
      .forBrowser('chrome')
      .setChromeOptions(options)
      .build()

    console.log("-> 浏览器启动成功！")
    return driver
  } catch (error) {
    console.error("-> 浏览器启动失败！错误信息:", error.message)
    throw error
  }
}

async function getProxyIpInfo(driver, proxyUrl) {
  // const url = "https://httpbin.org/ip"
  const url = "https://myip.ipip.net"

  console.log("-> Getting proxy IP info:", proxyUrl)

  try {
    await driver.get(url)
    await driver.wait(until.elementLocated(By.css("body")), 30000)
    const pageText = await driver.findElement(By.css("body")).getText()
    console.log("-> Proxy IP info:", pageText)
  } catch (error) {
    console.error("-> Failed to get proxy IP info:", error)
    throw new Error("Failed to get proxy IP info!")
  }
}

async function waitForSiteAvailable(driver, maxRetries = 3) {
  console.log("-> 检查网站可访问性...")
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      console.log(`-> 尝试访问网站 (第 ${i + 1} 次)...`)
      await driver.get("https://app.gradient.network/")
      
      // 等待页面加载
      await driver.wait(async () => {
        const readyState = await driver.executeScript('return document.readyState')
        console.log("-> 页面加载状态:", readyState)
        return readyState === 'complete'
      }, 30000)
      
      // 检查是否有错误页面
      const title = await driver.getTitle()
      console.log("-> 页面标题:", title)
      
      if (title.includes("can't be reached") || title.includes("ERR_")) {
        throw new Error("网站无法访问")
      }
      
      // 等待一下让 JavaScript 完全执行
      await driver.sleep(5000)
      
      // 验证页面内容
      const bodyText = await driver.findElement(By.css('body')).getText()
      if (bodyText.includes("This site can't be reached") || 
          bodyText.includes("ERR_") || 
          bodyText.includes("took too long to respond")) {
        throw new Error("页面加载错误")
      }
      
      console.log("-> 网站可以访问！")
      return true
      
    } catch (error) {
      console.error(`-> 第 ${i + 1} 次尝试失败:`, error.message)
      
      if (i < maxRetries - 1) {
        console.log("-> 等待 10 秒后重试...")
        await driver.sleep(10000)
      } else {
        throw new Error("网站无法访问，请检查网络连接和代理设置")
      }
    }
  }
}

async function findElementInShadowRoots(driver, selector) {
  console.log("-> 在 Shadow DOM 中查找元素:", selector)
  const shadowHosts = await driver.findElements(By.css('*'))
  for (const host of shadowHosts) {
    try {
      const shadowRoot = await driver.executeScript('return arguments[0].shadowRoot', host)
      if (shadowRoot) {
        console.log("-> 找到 Shadow Root")
        const element = await driver.executeScript(`
          return arguments[0].shadowRoot.querySelector('${selector}')
        `, host)
        if (element) {
          console.log("-> 在 Shadow DOM 中找到元素")
          return element
        }
      }
    } catch (e) {
      // 忽略错误，继续查找
    }
  }
  return null
}

async function findElementInFrames(driver, selector) {
  console.log("-> 在 iframe 中查找元素:", selector)
  const frames = await driver.findElements(By.css('iframe'))
  for (const frame of frames) {
    try {
      console.log("-> 切换到 iframe")
      await driver.switchTo().frame(frame)
      const element = await driver.findElement(By.css(selector))
      if (element) {
        console.log("-> 在 iframe 中找到元素")
        return element
      }
    } catch (e) {
      // 忽略错误，继续查找
    } finally {
      await driver.switchTo().defaultContent()
    }
  }
  return null
}

async function findElement(driver, selector) {
  console.log("-> 开始查找元素:", selector)
  
  // 1. 先在主文档中查找
  try {
    const element = await driver.findElement(By.css(selector))
    if (element) {
      console.log("-> 在主文档中找到元素")
      return element
    }
  } catch (e) {
    console.log("-> 主文档中未找到元素")
  }
  
  // 2. 在 Shadow DOM 中查找
  const shadowElement = await findElementInShadowRoots(driver, selector)
  if (shadowElement) {
    return shadowElement
  }
  
  // 3. 在 iframe 中查找
  const frameElement = await findElementInFrames(driver, selector)
  if (frameElement) {
    return frameElement
  }
  
  throw new Error(`无法找到元素: ${selector}`)
}

// 添加状态检查函数
async function checkSupportStatus(driver) {
  try {
    // 等待 Status 元素出现
    await driver.wait(
      until.elementLocated(By.xpath('//div[contains(text(), "Status")]')),
      30000
    );

    // 检查连接状态
    const supportStatus = await driver
      .findElement(By.css(".absolute.mt-3.right-0.z-10"))
      .getText();

    console.log("-> 状态:", supportStatus);
    return supportStatus;
  } catch (error) {
    console.error('-> 状态检查出错:', error.message);
    return null;
  }
}

async function reloadExtension(driver) {
  try {
    // 重新加载扩展
    await driver.get(`chrome-extension://${extensionId}/popup.html`);
    await driver.navigate().refresh();
    
    // 等待页面加载完成
    await driver.wait(async () => {
      const readyState = await driver.executeScript('return document.readyState');
      return readyState === 'complete';
    }, 10000);

    // 等待扩展初始化
    await driver.sleep(5000);
    
    return true;
  } catch (error) {
    console.error('-> 扩展重载失败:', error.message);
    return false;
  }
}

async function startStatusCheck(driver) {
  console.log('-> 开始定时状态检查 (每5分钟)...');
  
  setInterval(async () => {
    try {
      let retryCount = 0;
      let status = null;
      
      while (retryCount < 10) {
        // 重新加载扩展
        console.log(`-> 第 ${retryCount + 1} 次尝试加载扩展...`);
        const reloadSuccess = await reloadExtension(driver);
        
        if (!reloadSuccess) {
          console.log('-> 扩展加载失败，重试...');
          retryCount++;
          continue;
        }

        // 检查状态
        status = await checkSupportStatus(driver);
        
        if (status === null) {
          console.log('-> 状态检查失败，重试...');
          retryCount++;
          continue;
        }
        
        if (status.includes('Good')) {
          console.log('-> 状态正常 (Good)');
          break;
        } else if (status.includes('Disconnected')) {
          console.log('-> 状态异常 (Disconnected)，重试...');
          retryCount++;
          await driver.sleep(5000);  // 等待5秒后重试
          continue;
        }
      }
      
      // 如果10次重试后仍未成功，重启程序
      if (retryCount >= 10) {
        console.log('-> 达到最大重试次数，准备重启程序...');
        await driver.quit();
        process.exit(1);  // 退出程序，PM2 会自动重启
      }
      
    } catch (error) {
      console.error('-> 状态检查出错:', error.message);
    }
  }, 300000); // 每5分钟运行一次
}

// 主程序
(async function main() {
  let driver;
  try {
    // 先下载扩展
    await downloadExtension(extensionId)
    
    // 启动浏览器
    driver = await startBrowser()
    
    console.log("-> 正在访问 Gradient Network...")
    await waitForSiteAvailable(driver)
    console.log("-> 页面加载成功！")

    // 等待页面完全加载
    await driver.wait(async () => {
      const readyState = await driver.executeScript('return document.readyState')
      console.log("-> 页面加载状态:", readyState)
      return readyState === 'complete'
    }, 30000)

    // 等待一下让 JavaScript 完全执行
    await driver.sleep(5000)
    console.log("-> 等待 JavaScript 执行完成")

    // 保存页面源码和结构信息
    if (ALLOW_DEBUG) {
      console.log("-> 正在分析页面结构...")
      const pageSource = await driver.getPageSource()
      fs.writeFileSync('page_source.html', pageSource)
      console.log("-> 已保存页面源码")

      const title = await driver.getTitle()
      console.log("-> 页面标题:", title)

      const url = await driver.getCurrentUrl()
      console.log("-> 当前URL:", url)

      // 获取所有 h1 标签的文本
      const h1Elements = await driver.findElements(By.css('h1'))
      console.log("-> H1标签数量:", h1Elements.length)
      for (const h1 of h1Elements) {
        const text = await h1.getText()
        console.log("-> H1文本:", text)
      }

      // 获取所有输入框
      const inputs = await driver.findElements(By.css('input'))
      console.log("-> 输入框数量:", inputs.length)
      for (const input of inputs) {
        const type = await input.getAttribute('type')
        const placeholder = await input.getAttribute('placeholder')
        console.log("-> 输入框:", { type, placeholder })
      }
    }

    console.log("-> 等待登录表单加载...")
    
    // 尝试多个可能的选择器
    const emailSelectors = [
      'input[placeholder="Enter Email"]',
      'input[type="email"]',
      'input[type="text"]'
    ]
    
    console.log("-> 尝试查找邮箱输入框...")
    let emailInput = null
    for (const selector of emailSelectors) {
      try {
        console.log("-> 尝试选择器:", selector)
        emailInput = await findElement(driver, selector)
        if (emailInput) {
          const isDisplayed = await driver.executeScript('return arguments[0].offsetParent !== null', emailInput)
          const isEnabled = await emailInput.isEnabled()
          console.log("-> 元素状态:", { isDisplayed, isEnabled })
          
          if (isDisplayed && isEnabled) {
            console.log("-> 找到可用的邮箱输入框:", selector)
            break
          }
        }
      } catch (e) {
        console.log("-> 未找到或无法使用选择器:", selector, e.message)
      }
    }
    
    if (!emailInput) {
      console.error("-> 无法找到可用的邮箱输入框！")
      if (ALLOW_DEBUG) {
        // 尝试获取页面结构
        const bodyText = await driver.findElement(By.css('body')).getText()
        console.log("-> 页面文本内容:", bodyText)
        await generateErrorReport(driver)
      }
      throw new Error("无法找到可用的登录表单元素")
    }

    console.log("-> 等待密码输入框...")
    let passwordInput = null
    try {
      console.log("-> 尝试查找密码输入框...")
      passwordInput = await findElement(driver, 'input[placeholder="Enter Password"]')
      if (passwordInput) {
        const isDisplayed = await driver.executeScript('return arguments[0].offsetParent !== null', passwordInput)
        const isEnabled = await passwordInput.isEnabled()
        console.log("-> 密码输入框状态:", { isDisplayed, isEnabled })
        
        if (!isDisplayed || !isEnabled) {
          console.log("-> 等待密码输入框变为可用...")
          await driver.sleep(5000)
          // 再次检查状态
          const isDisplayedAfterWait = await driver.executeScript('return arguments[0].offsetParent !== null', passwordInput)
          const isEnabledAfterWait = await passwordInput.isEnabled()
          console.log("-> 等待后的密码输入框状态:", { isDisplayedAfterWait, isEnabledAfterWait })
          
          if (!isDisplayedAfterWait || !isEnabledAfterWait) {
            throw new Error("密码输入框不可用")
          }
        }
      } else {
        throw new Error("未找到密码输入框")
      }
    } catch (error) {
      console.error("-> 无法找到或使用密码输入框:", error.message)
      if (ALLOW_DEBUG) {
        await generateErrorReport(driver)
      }
      throw error
    }

    console.log("-> 等待登录按钮...")
    let loginButton = null
    try {
      console.log("-> 尝试查找登录按钮...")
      const buttons = await driver.findElements(By.css('button'))
      console.log("-> 找到按钮数量:", buttons.length)
      
      for (const button of buttons) {
        // 获取按钮的完整 HTML
        const buttonHtml = await button.getAttribute('outerHTML')
        console.log("-> 按钮 HTML:", buttonHtml)
        
        // 获取按钮内的所有文本，包括子元素
        const buttonText = await driver.executeScript(`
          return arguments[0].textContent || arguments[0].innerText || '';
        `, button)
        
        // 检查按钮的类名和其他属性
        const className = await button.getAttribute('class')
        const type = await button.getAttribute('type')
        const value = await button.getAttribute('value')
        
        const isDisplayed = await driver.executeScript('return arguments[0].offsetParent !== null', button)
        const isEnabled = await button.isEnabled()
        console.log("-> 按钮信息:", { 
          text: buttonText, 
          className,
          type,
          value,
          isDisplayed, 
          isEnabled 
        })
        
        // 检查按钮文本、类名或其他属性来识别登录按钮
        if ((buttonText.toLowerCase().includes('log in') || 
             buttonText.toLowerCase().includes('login') ||
             className?.toLowerCase().includes('login') ||
             type === 'submit') && 
            isDisplayed && 
            isEnabled) {
          loginButton = button
          console.log("-> 找到可用的登录按钮")
          break
        }
      }
      
      // 如果没有找到登录按钮，尝试使用 XPath
      if (!loginButton) {
        console.log("-> 尝试使用 XPath 查找登录按钮...")
        const xpaths = [
          "//button[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'log in')]",
          "//button[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'login')]",
          "//button[@type='submit']",
          "//button[contains(@class, 'login')]"
        ]
        
        for (const xpath of xpaths) {
          try {
            const button = await driver.findElement(By.xpath(xpath))
            const isDisplayed = await driver.executeScript('return arguments[0].offsetParent !== null', button)
            const isEnabled = await button.isEnabled()
            
            if (isDisplayed && isEnabled) {
              loginButton = button
              console.log("-> 使用 XPath 找到可用的登录按钮:", xpath)
              break
            }
          } catch (e) {
            console.log("-> XPath 未找到按钮:", xpath)
          }
        }
      }
      
      if (!loginButton) {
        throw new Error("未找到可用的登录按钮")
      }
    } catch (error) {
      console.error("-> 无法找到或使用登录按钮:", error.message)
      if (ALLOW_DEBUG) {
        await generateErrorReport(driver)
      }
      throw error
    }

    console.log("-> 输入邮箱...")
    await emailInput.clear()
    await emailInput.sendKeys(USER)
    console.log("-> 输入密码...")
    await passwordInput.clear()
    await passwordInput.sendKeys(PASSWORD)
    console.log("-> 点击登录按钮...")
    await loginButton.click()

    console.log("-> 等待登录完成...")
    
    // 保存页面源码以供调试
    if (ALLOW_DEBUG) {
      const pageSource = await driver.getPageSource()
      fs.writeFileSync('login_page.html', pageSource)
      console.log("-> 已保存登录页面源码")
    }

    // 等待登录成功
    try {
      await driver.wait(until.elementLocated(By.css('a[href="/dashboard/setting"]')), 30000)
      console.log("-> 登录成功！")
    } catch (error) {
      console.error("-> 登录失败！可能的原因：")
      console.error("   1. 账号或密码错误")
      console.error("   2. 网络连接问题")
      console.error("   3. 页面加载超时")
      
      // 获取可能的错误信息
      try {
        const errorMessages = await driver.findElements(By.css('.text-red-500, .text-danger, .error-message'))
        for (const element of errorMessages) {
          const text = await element.getText()
          console.error("-> 错误信息:", text)
        }
      } catch (e) {
        console.error("-> 无法获取错误信息")
      }
      
      throw new Error("登录失败，请检查账号密码或网络连接")
    }

    console.log("-> 正在打开扩展...")

    // 截图登录状态
    await takeScreenshot(driver, "logined.png")

    await driver.get(`chrome-extension://${extensionId}/popup.html`)

    console.log("-> 扩展已打开！")

    // 等待 Status 元素出现
    await driver.wait(
      until.elementLocated(By.xpath('//div[contains(text(), "Status")]')),
      30000
    )

    console.log("-> 扩展加载完成！")

    // 处理 "I got it" 按钮
    try {
      const gotItButton = await driver.findElement(
        By.xpath('//button[contains(text(), "I got it")]')
      )
      await gotItButton.click()
      console.log('-> "I got it" 按钮已点击！')
    } catch (error) {
      console.log('-> 未找到 "I got it" 按钮（跳过）')
    }

    // 检查区域可用性
    try {
      await driver.findElement(
        By.xpath('//*[contains(text(), "Sorry, Gradient is not yet available in your region.")]')
      )
      console.log("-> 错误：Gradient 在当前区域不可用")
      await driver.quit()
      process.exit(1)
    } catch (error) {
      console.log("-> Gradient 在当前区域可用")
    }

    // 检查连接状态
    const supportStatus = await driver
      .findElement(By.css(".absolute.mt-3.right-0.z-10"))
      .getText()

    console.log("-> 状态:", supportStatus)

    if (supportStatus.includes("Disconnected")) {
      console.log("-> 连接失败！请检查以下内容：")
      console.log(`
    - 确保代理正常工作：curl -vv -x ${PROXY} https://myip.ipip.net
    - 确保 Docker 镜像是最新版本
    - 官方服务可能不稳定，这是正常现象，程序会自动重启
    - 如果使用免费代理，可能被官方服务封禁，请尝试其他静态住宅代理
      `)
      await generateErrorReport(driver)
      await driver.quit()
      process.exit(1)
    }

    console.log("-> 连接成功！开始运行...")
    await takeScreenshot(driver, "connected.png")

    console.log({
      support_status: supportStatus,
    })

    console.log("-> 程序已启动！")

    // 启动状态检查
    await startStatusCheck(driver);

    // 定期检查状态
    setInterval(async () => {
      try {
        const title = await driver.getTitle();
        console.log(`-> [${USER}] 正在运行...`, title);
        if (PROXY) {
          console.log(`-> [${USER}] 使用代理 ${PROXY} 运行中...`);
        }
      } catch (error) {
        console.error("-> 状态检查遇到错误:", error.message);
        console.log("-> 将在下次检查时重试...");
      }
    }, 60000); // 1分钟检查一次

  } catch (error) {
    console.error("-> 发生错误:", error.message);
    if (ALLOW_DEBUG) {
      console.log("-> 正在保存错误截图...");
      try {
        if (driver) {
          const screenshot = await driver.takeScreenshot();
          const filename = `error_${Date.now()}.png`;
          fs.writeFileSync(filename, screenshot, 'base64');
          console.log(`-> 错误截图已保存: ${filename}`);
        }
      } catch (screenshotError) {
        console.error("-> 无法保存错误截图:", screenshotError.message);
      }
    }
    // 不要立即退出，而是重启浏览器
    console.log("-> 尝试重启浏览器...");
    try {
      if (driver) {
        await driver.quit();
      }
      // 递归调用main函数重新开始
      return main();
    } catch (restartError) {
      console.error("-> 重启失败:", restartError.message);
      process.exit(1);
    }
  }
})();
