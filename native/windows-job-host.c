#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <psapi.h>

#include <stddef.h>
#include <stdint.h>
#include <stdio.h>
#include <wchar.h>

enum HostExitCode {
  HOST_USAGE = 240,
  HOST_JOB_SETUP = 241,
  HOST_METRICS_INITIAL = 242,
  HOST_COMMAND_LINE = 243,
  HOST_CREATE_PROCESS = 244,
  HOST_ASSIGN_PROCESS = 245,
  HOST_WAIT_PROCESS = 246,
  HOST_METRICS_RUNTIME = 247,
  HOST_CHILD_EXIT_CODE = 248,
  HOST_INTERNAL = 249
};

typedef struct HostOptions {
  const wchar_t *metrics_path;
  uint64_t memory_bytes;
  DWORD process_limit;
  uint64_t cpu_ms;
  int command_index;
} HostOptions;

typedef struct MetricsSnapshot {
  uint64_t rss_bytes;
  DWORD process_count;
} MetricsSnapshot;

static int parse_options(int argc, wchar_t **argv, HostOptions *options);
static int parse_uint64(const wchar_t *value, uint64_t *result);
static int is_absolute_windows_path(const wchar_t *path);
static wchar_t *build_command_line(int argc, wchar_t **argv, int first_argument);
static int configure_job(HANDLE job, const HostOptions *options);
static int write_metrics_atomic(const wchar_t *path, const MetricsSnapshot *snapshot);
static int query_job_metrics(
    HANDLE job,
    DWORD process_limit,
    MetricsSnapshot *snapshot);
static void terminate_child(HANDLE job, PROCESS_INFORMATION *process);

int wmain(int argc, wchar_t **argv) {
  HostOptions options;
  HANDLE job = NULL;
  PROCESS_INFORMATION child;
  STARTUPINFOW startup;
  wchar_t *command_line = NULL;
  DWORD child_exit_code = 0;
  DWORD wait_result;
  MetricsSnapshot peak_metrics = {0, 1};
  int result = HOST_INTERNAL;
  int child_created = 0;
  int child_assigned = 0;

  ZeroMemory(&options, sizeof(options));
  ZeroMemory(&child, sizeof(child));
  ZeroMemory(&startup, sizeof(startup));
  startup.cb = sizeof(startup);
  startup.dwFlags = STARTF_USESTDHANDLES;
  startup.hStdInput = GetStdHandle(STD_INPUT_HANDLE);
  startup.hStdOutput = GetStdHandle(STD_OUTPUT_HANDLE);
  startup.hStdError = GetStdHandle(STD_ERROR_HANDLE);
  SetErrorMode(SEM_FAILCRITICALERRORS | SEM_NOGPFAULTERRORBOX | SEM_NOOPENFILEERRORBOX);

  if (!parse_options(argc, argv, &options)) return HOST_USAGE;

  job = CreateJobObjectW(NULL, NULL);
  if (job == NULL ||
      !SetHandleInformation(job, HANDLE_FLAG_INHERIT, 0) ||
      !configure_job(job, &options)) {
    result = HOST_JOB_SETUP;
    goto cleanup;
  }

  command_line = build_command_line(argc, argv, options.command_index);
  if (command_line == NULL) {
    result = HOST_COMMAND_LINE;
    goto cleanup;
  }

  if (!CreateProcessW(
          NULL,
          command_line,
          NULL,
          NULL,
          TRUE,
          CREATE_SUSPENDED | CREATE_UNICODE_ENVIRONMENT | CREATE_NO_WINDOW,
          NULL,
          NULL,
          &startup,
          &child)) {
    result = HOST_CREATE_PROCESS;
    goto cleanup;
  }
  child_created = 1;

  if (!AssignProcessToJobObject(job, child.hProcess)) {
    result = HOST_ASSIGN_PROCESS;
    goto cleanup;
  }
  child_assigned = 1;

  if (!write_metrics_atomic(options.metrics_path, &peak_metrics)) {
    result = HOST_METRICS_INITIAL;
    goto cleanup;
  }

  if (ResumeThread(child.hThread) == (DWORD)-1) {
    result = HOST_WAIT_PROCESS;
    goto cleanup;
  }
  CloseHandle(child.hThread);
  child.hThread = NULL;

  for (;;) {
    MetricsSnapshot current_metrics;
    int metrics_changed = 0;
    wait_result = WaitForSingleObject(child.hProcess, 10);
    if (wait_result == WAIT_FAILED) {
      result = HOST_WAIT_PROCESS;
      goto cleanup;
    }
    if (!query_job_metrics(job, options.process_limit, &current_metrics)) {
      result = HOST_METRICS_RUNTIME;
      goto cleanup;
    }
    if (current_metrics.rss_bytes > peak_metrics.rss_bytes) {
      peak_metrics.rss_bytes = current_metrics.rss_bytes;
      metrics_changed = 1;
    }
    if (current_metrics.process_count > peak_metrics.process_count) {
      peak_metrics.process_count = current_metrics.process_count;
      metrics_changed = 1;
    }
    if (metrics_changed && !write_metrics_atomic(options.metrics_path, &peak_metrics)) {
      result = HOST_METRICS_RUNTIME;
      goto cleanup;
    }
    if (wait_result == WAIT_OBJECT_0) break;
    if (wait_result != WAIT_TIMEOUT) {
      result = HOST_WAIT_PROCESS;
      goto cleanup;
    }
  }

  if (!GetExitCodeProcess(child.hProcess, &child_exit_code)) {
    result = HOST_CHILD_EXIT_CODE;
    goto cleanup;
  }

  CloseHandle(child.hProcess);
  child.hProcess = NULL;
  CloseHandle(job);
  job = NULL;
  HeapFree(GetProcessHeap(), 0, command_line);
  command_line = NULL;
  ExitProcess(child_exit_code);
  return 0;

cleanup:
  if (child_created) {
    if (child_assigned && job != NULL) {
      TerminateJobObject(job, 1);
    } else if (child.hProcess != NULL) {
      TerminateProcess(child.hProcess, 1);
    }
    terminate_child(job, &child);
  }
  if (job != NULL) CloseHandle(job);
  if (command_line != NULL) HeapFree(GetProcessHeap(), 0, command_line);
  return result;
}

static int parse_options(int argc, wchar_t **argv, HostOptions *options) {
  int index = 1;
  int metrics_seen = 0;
  int memory_seen = 0;
  int process_seen = 0;
  int cpu_seen = 0;
  uint64_t process_limit = 0;

  while (index < argc && wcscmp(argv[index], L"--") != 0) {
    const wchar_t *name = argv[index++];
    const wchar_t *value;
    if (index >= argc) return 0;
    value = argv[index++];
    if (wcscmp(name, L"--metrics") == 0 && !metrics_seen) {
      if (!is_absolute_windows_path(value)) return 0;
      options->metrics_path = value;
      metrics_seen = 1;
    } else if (wcscmp(name, L"--memory-bytes") == 0 && !memory_seen) {
      if (!parse_uint64(value, &options->memory_bytes) || options->memory_bytes == 0) return 0;
      memory_seen = 1;
    } else if (wcscmp(name, L"--process-limit") == 0 && !process_seen) {
      if (!parse_uint64(value, &process_limit) || process_limit == 0 || process_limit > 1024) {
        return 0;
      }
      options->process_limit = (DWORD)process_limit;
      process_seen = 1;
    } else if (wcscmp(name, L"--cpu-ms") == 0 && !cpu_seen) {
      if (!parse_uint64(value, &options->cpu_ms) ||
          options->cpu_ms == 0 ||
          options->cpu_ms > ((uint64_t)INT64_MAX / 10000U)) {
        return 0;
      }
      cpu_seen = 1;
    } else {
      return 0;
    }
  }
  if (index >= argc || wcscmp(argv[index], L"--") != 0) return 0;
  index++;
  if (index >= argc) return 0;
  if (!metrics_seen || !memory_seen || !process_seen || !cpu_seen) return 0;
  options->command_index = index;
  return 1;
}

static int parse_uint64(const wchar_t *value, uint64_t *result) {
  uint64_t parsed = 0;
  const wchar_t *cursor = value;
  if (cursor == NULL || *cursor == L'\0') return 0;
  while (*cursor != L'\0') {
    unsigned int digit;
    if (*cursor < L'0' || *cursor > L'9') return 0;
    digit = (unsigned int)(*cursor - L'0');
    if (parsed > (UINT64_MAX - digit) / 10U) return 0;
    parsed = parsed * 10U + digit;
    cursor++;
  }
  *result = parsed;
  return 1;
}

static int is_absolute_windows_path(const wchar_t *path) {
  size_t length;
  if (path == NULL) return 0;
  length = wcslen(path);
  if (length >= 3 &&
      ((path[0] >= L'A' && path[0] <= L'Z') ||
       (path[0] >= L'a' && path[0] <= L'z')) &&
      path[1] == L':' &&
      (path[2] == L'\\' || path[2] == L'/')) {
    return 1;
  }
  if (length >= 3 && path[0] == L'\\' && path[1] == L'\\' && path[2] != L'\0') {
    return 1;
  }
  return 0;
}

static wchar_t *build_command_line(int argc, wchar_t **argv, int first_argument) {
  size_t capacity = 1;
  wchar_t *result;
  wchar_t *output;
  int index;

  for (index = first_argument; index < argc; index++) {
    size_t length = wcslen(argv[index]);
    if (capacity > SIZE_MAX - 3U) return NULL;
    if (length > (SIZE_MAX - capacity - 3U) / 2U) return NULL;
    capacity += length * 2U + 3U;
  }
  if (capacity > 32767U || capacity > SIZE_MAX / sizeof(wchar_t)) return NULL;
  result = HeapAlloc(GetProcessHeap(), 0, capacity * sizeof(wchar_t));
  if (result == NULL) return NULL;
  output = result;

  for (index = first_argument; index < argc; index++) {
    const wchar_t *input = argv[index];
    size_t backslashes = 0;
    if (index != first_argument) *output++ = L' ';
    *output++ = L'"';
    while (*input != L'\0') {
      if (*input == L'\\') {
        backslashes++;
        input++;
        continue;
      }
      if (*input == L'"') {
        size_t count;
        for (count = 0; count < backslashes * 2U + 1U; count++) *output++ = L'\\';
        *output++ = L'"';
        backslashes = 0;
        input++;
        continue;
      }
      while (backslashes > 0) {
        *output++ = L'\\';
        backslashes--;
      }
      *output++ = *input++;
    }
    while (backslashes > 0) {
      *output++ = L'\\';
      *output++ = L'\\';
      backslashes--;
    }
    *output++ = L'"';
  }
  *output = L'\0';
  return result;
}

static int configure_job(HANDLE job, const HostOptions *options) {
  JOBOBJECT_EXTENDED_LIMIT_INFORMATION limits;
  ZeroMemory(&limits, sizeof(limits));
  limits.BasicLimitInformation.LimitFlags =
      JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE |
      JOB_OBJECT_LIMIT_ACTIVE_PROCESS |
      JOB_OBJECT_LIMIT_PROCESS_MEMORY |
      JOB_OBJECT_LIMIT_JOB_MEMORY |
      JOB_OBJECT_LIMIT_JOB_TIME;
  limits.BasicLimitInformation.ActiveProcessLimit = options->process_limit;
  limits.BasicLimitInformation.PerJobUserTimeLimit.QuadPart =
      (LONGLONG)(options->cpu_ms * 10000U);
  limits.ProcessMemoryLimit = (SIZE_T)options->memory_bytes;
  limits.JobMemoryLimit = (SIZE_T)options->memory_bytes;
  return SetInformationJobObject(
      job,
      JobObjectExtendedLimitInformation,
      &limits,
      (DWORD)sizeof(limits));
}

static int write_metrics_atomic(const wchar_t *path, const MetricsSnapshot *snapshot) {
  size_t path_length = wcslen(path);
  size_t temporary_capacity;
  wchar_t *temporary_path;
  char json[128];
  int json_length;
  HANDLE file;
  DWORD offset = 0;
  int result = 0;

  if (path_length > SIZE_MAX - 32U) return 0;
  temporary_capacity = path_length + 32U;
  if (temporary_capacity > SIZE_MAX / sizeof(wchar_t)) return 0;
  temporary_path = HeapAlloc(GetProcessHeap(), 0, temporary_capacity * sizeof(wchar_t));
  if (temporary_path == NULL) return 0;
  if (swprintf(
          temporary_path,
          temporary_capacity,
          L"%ls.tmp.%lu",
          path,
          (unsigned long)GetCurrentProcessId()) < 0) {
    HeapFree(GetProcessHeap(), 0, temporary_path);
    return 0;
  }

  json_length = snprintf(
      json,
      sizeof(json),
      "{\"rssBytes\":%llu,\"processCount\":%lu}",
      (unsigned long long)snapshot->rss_bytes,
      (unsigned long)snapshot->process_count);
  if (json_length <= 0 || (size_t)json_length >= sizeof(json)) goto cleanup_path;

  file = CreateFileW(
      temporary_path,
      GENERIC_WRITE,
      0,
      NULL,
      CREATE_ALWAYS,
      FILE_ATTRIBUTE_TEMPORARY,
      NULL);
  if (file == INVALID_HANDLE_VALUE) goto cleanup_path;
  while (offset < (DWORD)json_length) {
    DWORD written = 0;
    if (!WriteFile(file, json + offset, (DWORD)json_length - offset, &written, NULL) ||
        written == 0) {
      CloseHandle(file);
      goto cleanup_file;
    }
    offset += written;
  }
  if (!FlushFileBuffers(file)) {
    CloseHandle(file);
    goto cleanup_file;
  }
  if (!CloseHandle(file)) goto cleanup_file;
  if (!MoveFileExW(
          temporary_path,
          path,
          MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH)) {
    goto cleanup_file;
  }
  result = 1;
  goto cleanup_path;

cleanup_file:
  DeleteFileW(temporary_path);
cleanup_path:
  HeapFree(GetProcessHeap(), 0, temporary_path);
  return result;
}

static int query_job_metrics(
    HANDLE job,
    DWORD process_limit,
    MetricsSnapshot *snapshot) {
  size_t buffer_size = offsetof(JOBOBJECT_BASIC_PROCESS_ID_LIST, ProcessIdList) +
                       (size_t)process_limit * sizeof(ULONG_PTR);
  JOBOBJECT_BASIC_PROCESS_ID_LIST *processes;
  DWORD returned = 0;
  DWORD index;
  uint64_t rss_bytes = 0;

  processes = HeapAlloc(GetProcessHeap(), HEAP_ZERO_MEMORY, buffer_size);
  if (processes == NULL) return 0;
  if (!QueryInformationJobObject(
          job,
          JobObjectBasicProcessIdList,
          processes,
          (DWORD)buffer_size,
          &returned)) {
    HeapFree(GetProcessHeap(), 0, processes);
    return 0;
  }

  for (index = 0; index < processes->NumberOfProcessIdsInList; index++) {
    DWORD process_id = (DWORD)processes->ProcessIdList[index];
    HANDLE process = OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, FALSE, process_id);
    PROCESS_MEMORY_COUNTERS counters;
    if (process == NULL) continue;
    ZeroMemory(&counters, sizeof(counters));
    if (K32GetProcessMemoryInfo(process, &counters, (DWORD)sizeof(counters))) {
      uint64_t working_set = (uint64_t)counters.WorkingSetSize;
      if (UINT64_MAX - rss_bytes < working_set) {
        CloseHandle(process);
        HeapFree(GetProcessHeap(), 0, processes);
        return 0;
      }
      rss_bytes += working_set;
    }
    CloseHandle(process);
  }

  snapshot->rss_bytes = rss_bytes;
  snapshot->process_count = processes->NumberOfProcessIdsInList;
  HeapFree(GetProcessHeap(), 0, processes);
  return 1;
}

static void terminate_child(HANDLE job, PROCESS_INFORMATION *process) {
  (void)job;
  if (process->hThread != NULL) {
    CloseHandle(process->hThread);
    process->hThread = NULL;
  }
  if (process->hProcess != NULL) {
    WaitForSingleObject(process->hProcess, 5000);
    CloseHandle(process->hProcess);
    process->hProcess = NULL;
  }
}
