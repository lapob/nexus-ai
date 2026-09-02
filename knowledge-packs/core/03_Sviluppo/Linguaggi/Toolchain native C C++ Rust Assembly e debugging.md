---
title: Toolchain native: C, C++, Rust, Assembly e debugging
type: programming-guide
area: native-development
status: evergreen
level: advanced
visibility: public
created: 2026-07-29
updated: 2026-08-08
source_kind: curated
tags: [c, cpp, rust, assembly, cmake, gdb, lldb, windbg]
aliases: [Toolchain native]
---

# Toolchain native: C, C++, Rust, Assembly e debugging

## Dal sorgente al processo

Preprocessing → compilazione → assembly → linking → caricamento. Distingui errore di compilazione, simbolo non risolto, ABI incompatibile, libreria mancante e crash runtime.

```bash
cc -Wall -Wextra -Wpedantic -O2 -g main.c -o app
c++ -std=c++23 -Wall -Wextra -O2 -g main.cpp -o app
cc -E main.c > main.i
cc -S main.c -o main.s
nm -C app
objdump -d -M intel app
ldd app                       # Linux
otool -L app                  # macOS
dumpbin /DEPENDENTS app.exe   # Developer Command Prompt
```

## CMake

```cmake
cmake_minimum_required(VERSION 3.24)
project(example LANGUAGES CXX)
add_executable(example src/main.cpp)
target_compile_features(example PRIVATE cxx_std_20)
target_compile_options(example PRIVATE
  $<$<CXX_COMPILER_ID:GNU,Clang>:-Wall;-Wextra;-Wpedantic>
  $<$<CXX_COMPILER_ID:MSVC>:/W4>)
enable_testing()
add_test(NAME smoke COMMAND example)
```

```bash
cmake -S . -B build -DCMAKE_BUILD_TYPE=Debug
cmake --build build --parallel
ctest --test-dir build --output-on-failure
```

Preferisci target moderni a flag globali. Blocca dipendenze e genera build fuori dal sorgente.

## Sanitizer e analisi

```bash
cc -fsanitize=address,undefined -fno-omit-frame-pointer -g main.c
clang-tidy src/main.cpp -- -std=c++20
scan-build cmake --build build
valgrind --leak-check=full ./app
```

Sanitizer e Valgrind cambiano timing e layout: riproduci anche senza strumentazione.

## Debugger

```text
gdb ./app
break main
run
bt
frame 2
info locals
watch variable
x/16gx address
```

LLDB usa `breakpoint set`, `run`, `bt`, `frame variable`, `memory read`. WinDbg usa simboli affidabili, `!analyze -v`, stack e moduli; non fidarti di uno stack senza simboli corretti.

## Rust

```bash
cargo fmt --check
cargo clippy --all-targets -- -D warnings
cargo test
cargo build --release
cargo audit
```

Isola `unsafe`, documenta invarianti e coprilo con test e sanitizer quando possibile.

## Collegamenti

- [[C e C++]]
- [[Rust]]
- [[Assembly e WebAssembly]]
- [[01_Informatica/Computer Science/Compilatori interpreti e toolchain|Compilatori]]
