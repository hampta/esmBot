#pragma once

#include "common.h"

using std::string;

char* Bounce(string* type, char* BufferData, size_t BufferLength,
             ArgumentMap Arguments, size_t* DataSize);