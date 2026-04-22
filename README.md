# LocalShare

一个面向局域网场景的轻量级点对点共享页面。

它把 `WebRTC DataChannel`、一个极简信令服务和静态页面组合在一起，让同一局域网里的两台设备可以直接通过浏览器：

- 看到彼此的 `IP:端口`
- 建立单会话连接
- 发送文字消息
- 发送单个文件

项目目标不是做复杂的网盘或 IM，而是提供一个“打开就能用”的局域网协作页面。

## 适用场景

- 两台办公电脑临时互传文件，不想开微信、QQ 或网盘
- 同一网络里的测试机、开发机之间快速发送日志、脚本或安装包
- 在内网里临时发一段命令、说明文字或多行配置
- 作为一个最小的 WebRTC 局域网传输示例项目，用于二次开发

## 功能说明

- 在线设备列表：自动显示当前在线的其他局域网设备
- 单会话模式：同一时间只和一台设备建立会话
- 聊天通道：支持发送多行文字消息
- 文件传输：选择单个文件后直接发送给当前会话对象
- 接收确认：对方必须先接受会话请求
- 点对点传输：文件与聊天内容通过 WebRTC DataChannel 直连，不经过服务端中转
- 极简信令：`server.js` 只负责设备发现、请求转发和 WebRTC 握手消息中继

## 技术结构

```text
public/
  index.html   页面结构
  style.css    界面样式
  app.js       前端状态、WebSocket 信令、WebRTC 会话与消息/文件逻辑

server.js      Node.js 静态服务 + WebSocket 信令服务
tests/         Node 内置 test 测试
```

## 本地启动

### 1. 安装依赖

```bash
npm install
```

### 2. 启动信令服务

```bash
npm start
```

默认会监听：

- `http://127.0.0.1:3001`

### 3. 直接访问

如果只是本机调试，可以直接打开：

- [http://127.0.0.1:3001](http://127.0.0.1:3001)

如果要让局域网里的其他设备访问，建议按下面的 Nginx 方式部署，用宿主机局域网 IP 暴露出去。

## 使用方式

1. 两台设备打开同一个局域网地址
2. 在左侧在线设备列表中选择目标设备
3. 点击“建立会话”
4. 对方点击“接受”
5. 会话建立后：
   - 可以直接发送文字消息
   - 也可以选择一个文件发送给当前会话设备

## 部署方式

推荐采用“**Nginx + Node 信令服务**”的组合：

- Nginx 对外暴露局域网访问地址
- Node 只在本机监听 `127.0.0.1:3001`
- Nginx 反向代理页面、`/api/meta` 和 `/ws`

这样做的好处是：

- 浏览器访问入口统一
- WebSocket 升级和静态资源都好处理
- 适合长期在一台内网机器上常驻

### 部署步骤

#### 1. 在服务器上准备项目

```bash
git clone https://github.com/thtwz/localShare.git
cd localShare
npm install
```

#### 2. 启动 Node 信令服务

```bash
PORT=3001 node server.js
```

如果需要长期运行，建议用 `pm2`、`systemd` 或后台守护方式启动。

#### 3. 配置 Nginx

示例配置：

```nginx
server {
    listen 23305;
    server_name _;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $http_host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    location /ws {
        proxy_pass http://127.0.0.1:3001/ws;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $http_host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }
}
```

#### 4. 访问方式

假设宿主机局域网 IP 是 `172.20.10.2`，Nginx 端口是 `23305`，那么局域网访问地址就是：

- `http://172.20.10.2:23305`

两台设备都打开这个地址即可使用。

## 测试

运行测试：

```bash
npm test
```

当前测试主要覆盖：

- 首页与接口可访问
- 在线设备列表广播
- 点对点会话请求/接受/关闭
- WebRTC 信令转发
- 心跳机制

## 注意事项

- 这是局域网场景下的最小实现，不包含账号系统、历史消息、群聊、多文件队列、断点续传等复杂能力
- WebRTC 真正传输的是浏览器之间的点对点数据，服务端只做信令
- 如果需要更高稳定性，可以继续扩展：
  - 文件发送取消
  - 多设备未读状态
  - 更完整的错误提示
  - 会话历史与消息持久化

## License

仓库中保留原始 `LICENSE` 文件。
