# Rust 编码规范

以下规则在编写或审查 Rust 代码时必须遵循。

## 1. 错误处理与安全

- **禁止 Panic**：生产代码中不得使用 `unwrap()`、`expect()` 或任何可能 panic 的写法。每个 `Result` 和 `Option` 必须显式处理。
- **Unsafe**：除非性能或 FFI 绝对需要，否则避免 `unsafe`。如果使用，必须附带 `// SAFETY:` 注释。

## 2. 模块与路径

- **绝对路径**：内部导入优先使用 `crate::`，避免 `super::`。看到别人残留的 `super::`，顺手清理。
- **干净 API**：除非为下游屏蔽依赖管理，否则不使用 `pub use`。

## 3. 状态与架构

- **禁止全局状态**：不使用 `lazy_static!`、`Once` 等全局状态模式。
- **显式上下文**：共享状态通过显式 context struct 传递，所有权必须清晰可追溯。

## 4. 务实的 Trait（YAGNI）

- 不要过度设计 Trait。只有一个实现时，具体 struct 就够了。代码服务于现实，不服务于抽象论文。

## 5. 现代模块布局

- **不用 `mod.rs`**：遵循 Rust 现代惯用路径。使用 `xxx.rs` 和对应的 `xxx/` 子目录。避免 `mod.rs` 以保持文件树整洁。

## 6. Swagger/OpenAPI 文档生成

- Web 应用必须生成 `swagger.json` 或 `swagger.yaml` 静态文件，不要求嵌入 Swagger UI 到运行时。
- 如果使用 axum 框架，使用 `utoipa` 生成 OpenAPI spec 文件。
- 如果框架没有成熟的第三方库支持，由 agent 根据代码手动编写 OpenAPI 规范文件。
