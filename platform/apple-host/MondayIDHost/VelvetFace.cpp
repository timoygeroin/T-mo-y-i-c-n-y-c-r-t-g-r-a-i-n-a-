#include "VelvetFace.h"
#if __has_include(<onnxruntime/onnxruntime_c_api.h>)
#include <onnxruntime/onnxruntime_c_api.h>
#else
#include "onnxruntime_c_api.h"
#endif
#include <algorithm>
#include <cstdio>
#include <memory>
#include <stdexcept>
#include <string>
#include <vector>

struct VelvetFace {
    const OrtApi *api = OrtGetApiBase()->GetApi(ORT_API_VERSION);
    OrtEnv *env = nullptr;
    OrtSessionOptions *options = nullptr;
    OrtSession *session = nullptr;
    OrtMemoryInfo *memory = nullptr;
    void check(OrtStatus *status) const {
        if (!status) return;
        std::string message(api->GetErrorMessage(status));
        api->ReleaseStatus(status);
        throw std::runtime_error(message);
    }
    ~VelvetFace() {
        if (memory) api->ReleaseMemoryInfo(memory);
        if (session) api->ReleaseSession(session);
        if (options) api->ReleaseSessionOptions(options);
        if (env) api->ReleaseEnv(env);
    }
};

static void describe(char *dest, int capacity, const char *message) {
    if (dest && capacity > 0) std::snprintf(dest, static_cast<size_t>(capacity), "%s", message);
}

VelvetFace *velvet_face_open(const char *path, char *error, int capacity) {
    try {
        if (!path) throw std::runtime_error("Missing Claire model");
        auto f = std::make_unique<VelvetFace>();
        if (!f->api) throw std::runtime_error("ONNX Runtime API version mismatch");
        f->check(f->api->CreateEnv(ORT_LOGGING_LEVEL_WARNING, "Velvet", &f->env));
        f->check(f->api->CreateSessionOptions(&f->options));
        f->check(f->api->SetIntraOpNumThreads(f->options, 3));
        f->check(f->api->SetInterOpNumThreads(f->options, 1));
        f->check(f->api->SetSessionGraphOptimizationLevel(f->options, ORT_ENABLE_ALL));
        f->check(f->api->CreateSession(f->env, path, f->options, &f->session));
        f->check(f->api->CreateCpuMemoryInfo(OrtArenaAllocator, OrtMemTypeDefault, &f->memory));
        return f.release();
    } catch (const std::exception &e) {
        describe(error, capacity, e.what());
        return nullptr;
    }
}

int velvet_face_predict(VelvetFace *f, const float *audio, const float *emotion,
                        int count, float *weights, char *error, int capacity) {
    if (!f || !audio || !emotion || !weights || count < 1 || count > 8) {
        describe(error, capacity, "Invalid frame batch"); return 0;
    }
    OrtValue *values[2] = {nullptr, nullptr}, *output = nullptr;
    OrtTensorTypeAndShapeInfo *shape = nullptr;
    bool ok = false;
    try {
        std::vector<float> emotions(size_t(count) * 26);
        for (int i = 0; i < count; ++i) std::copy(emotion, emotion+26, emotions.begin()+i*26);
        int64_t inputShape[3] = {count, 1, 8320}, emotionShape[3] = {count, 1, 26};
        f->check(f->api->CreateTensorWithDataAsOrtValue(f->memory,const_cast<float*>(audio),sizeof(float)*count*8320,inputShape,3,ONNX_TENSOR_ELEMENT_DATA_TYPE_FLOAT,&values[0]));
        f->check(f->api->CreateTensorWithDataAsOrtValue(f->memory,emotions.data(),sizeof(float)*emotions.size(),emotionShape,3,ONNX_TENSOR_ELEMENT_DATA_TYPE_FLOAT,&values[1]));
        const char *inputs[] = {"input","emotion"}, *outputs[] = {"face"};
        const OrtValue *readValues[] = {values[0], values[1]};
        f->check(f->api->Run(f->session,nullptr,inputs,readValues,2,outputs,1,&output));
        f->check(f->api->GetTensorTypeAndShape(output,&shape));
        size_t n=0; f->check(f->api->GetTensorShapeElementCount(shape,&n));
        if (n != size_t(count)*52) throw std::runtime_error("Invalid face output shape");
        void *result=nullptr; f->check(f->api->GetTensorMutableData(output,&result));
        std::copy_n(static_cast<const float*>(result),n,weights); ok=true;
    } catch (const std::exception &e) { describe(error,capacity,e.what()); }
    if (shape) f->api->ReleaseTensorTypeAndShapeInfo(shape);
    if (output) f->api->ReleaseValue(output);
    for (auto *v: values) if (v) f->api->ReleaseValue(v);
    return ok ? 1 : 0;
}
void velvet_face_close(VelvetFace *face) { delete face; }
