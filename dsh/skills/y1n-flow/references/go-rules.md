# Go 编码规范

以下规则在编写或审查 Go 代码时必须遵循。

## 1. 定义项中文注释（逐项一条）

- 对于任何*定义项*（struct、常量、全局变量），**必须**添加一行中文 `//` 注释说明其用途。
- 注释必须**一项一条**（不允许一条注释覆盖多个定义）。
- 此规则防止注释漂移，使 review 无歧义。

正确示例：

```go
// 监听端口
const ListenPort uint16 = 8080

// 服务配置
type ServerConfig struct {
    // 监听地址
    Addr string
}

// 全局日志对象
var Logger *slog.Logger
```

错误示例：

```go
// 监听端口和服务配置
const ListenPort uint16 = 8080
type ServerConfig struct{}
```

## 2. 禁止通过出参隐式赋值

- 不要通过写入出参（如 `*T`）并仅返回 `error` 来隐式更新值。
- 优先显式返回更新后的值：`func update(x T, ...) (T, error)`。
- 这使数据流清晰，避免隐藏副作用。

错误示例：

```go
func update(a *A, x X) error {
    *a = compute(x)
    return nil
}

if err := update(&a, x); err != nil {
    return err
}
```

正确示例：

```go
func update(a A, x X) (A, error) {
    next := compute(x)
    return next, nil
}

var err error
a, err = update(a, x)
if err != nil {
    return err
}
```

## 3. Swagger/OpenAPI 文档生成

- Web 应用必须生成 `swagger.json` 或 `swagger.yaml` 静态文件，不要求嵌入 Swagger UI 到运行时。
- 如果使用 echo 框架，使用 `echo-swagger` 工具生成文档。
- 其他框架使用对应的 swagger 生成工具，确保 API 文档与代码同步。
